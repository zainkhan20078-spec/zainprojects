/**
 * Anthropic Claude orchestration client.
 *
 * Production behaviours implemented here:
 *  - Strict per-request timeout (no unbounded LLM calls holding a webhook open).
 *  - Exponential backoff with full jitter on 429 / 408 / 409 / 5xx / connection
 *    errors, honouring `retry-after` when the API supplies it.
 *  - No retries on non-retryable 4xx (bad request, auth, permission).
 *  - Token accounting captured for every run so cost is auditable per workflow.
 *  - Graceful degradation: validated deterministic fallback if the API is
 *    unavailable, so the business pipeline never stalls on a vendor outage.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ANTHROPIC_CONFIG } from "@/lib/config";

export type ClaudeMode = "live" | "simulated" | "degraded";

export type ClaudeMeta = {
  mode: ClaudeMode;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  retries: number;
  error: string | null;
};

export type ClaudeJsonResult<T> = { data: T; meta: ClaudeMeta };

export const isClaudeConfigured = (): boolean => Boolean(ANTHROPIC_CONFIG.apiKey);

let client: Anthropic | null = null;

const getClient = (): Anthropic => {
  if (!ANTHROPIC_CONFIG.apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  if (!client) {
    client = new Anthropic({
      apiKey: ANTHROPIC_CONFIG.apiKey,
      timeout: ANTHROPIC_CONFIG.timeoutMs,
      // The SDK's built-in retry is disabled: orchestration owns backoff so the
      // retry count, delay and outcome are recorded per workflow run.
      maxRetries: 0,
    });
  }
  return client;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

type ErrorDetails = { status: number | null; retryAfterMs: number | null; message: string };

const inspectError = (error: unknown): ErrorDetails => {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      status?: unknown;
      message?: unknown;
      headers?: unknown;
    };
    const status = typeof candidate.status === "number" ? candidate.status : null;
    let retryAfterMs: number | null = null;
    if (candidate.headers && typeof candidate.headers === "object") {
      const headers = candidate.headers as Record<string, unknown>;
      const raw = headers["retry-after"] ?? headers["Retry-After"];
      const seconds = Number(typeof raw === "string" ? raw : NaN);
      if (Number.isFinite(seconds) && seconds > 0) retryAfterMs = seconds * 1000;
    }
    return {
      status,
      retryAfterMs,
      message: typeof candidate.message === "string" ? candidate.message : "Unknown Anthropic API error",
    };
  }
  return { status: null, retryAfterMs: null, message: String(error) };
};

/** Exponential backoff with full jitter, capped. */
const backoffDelay = (attempt: number, retryAfterMs: number | null): number => {
  if (retryAfterMs !== null) return Math.min(retryAfterMs, ANTHROPIC_CONFIG.maxBackoffMs);
  const exponential = ANTHROPIC_CONFIG.baseBackoffMs * 2 ** attempt;
  const jittered = exponential / 2 + Math.random() * (exponential / 2);
  return Math.min(jittered, ANTHROPIC_CONFIG.maxBackoffMs);
};

type RawCompletion = {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

/** Single attempt at a Claude completion with strict timeout from client config. */
async function callClaude(system: string, prompt: string, maxTokens: number, temperature: number): Promise<RawCompletion> {
  const anthropic = getClient();
  const message = await anthropic.messages.create({
    model: ANTHROPIC_CONFIG.model,
    max_tokens: Math.max(256, Math.min(maxTokens, 4096)),
    temperature: Math.max(0, Math.min(temperature, 1)),
    system,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) throw new Error("Claude returned an empty completion");

  return {
    text,
    model: message.model ?? ANTHROPIC_CONFIG.model,
    inputTokens: message.usage?.input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0,
  };
}

/** Call Claude, retrying transient failures; returns `null` if all attempts fail. */
async function completeWithRetry(
  system: string,
  prompt: string,
  maxTokens: number,
  temperature: number,
): Promise<{ completion: RawCompletion | null; retries: number; latencyMs: number; error: string | null }> {
  const startedAt = Date.now();
  let lastError: string | null = null;

  for (let attempt = 0; attempt <= ANTHROPIC_CONFIG.maxRetries; attempt += 1) {
    try {
      const completion = await callClaude(system, prompt, maxTokens, temperature);
      return { completion, retries: attempt, latencyMs: Date.now() - startedAt, error: null };
    } catch (error) {
      const details = inspectError(error);
      lastError = details.status ? `${details.status}: ${details.message}` : details.message;
      const retryable = details.status === null || RETRYABLE_STATUS.has(details.status);
      const isLastAttempt = attempt === ANTHROPIC_CONFIG.maxRetries;
      if (!retryable || isLastAttempt) {
        console.error("[claude] completion failed", { attempt, status: details.status, message: details.message });
        break;
      }
      const delay = backoffDelay(attempt, details.retryAfterMs);
      console.warn("[claude] retrying after transient failure", {
        attempt: attempt + 1,
        status: details.status,
        delayMs: Math.round(delay),
      });
      await sleep(delay);
    }
  }

  return { completion: null, retries: ANTHROPIC_CONFIG.maxRetries, latencyMs: Date.now() - startedAt, error: lastError };
}

/** Extract a JSON object from a model response, tolerating fences and prose. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object found in model response");
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Run a structured Claude task.
 *
 * @param fallback deterministic composer used when Claude is unavailable or the
 *                 response fails schema validation. It is never skipped silently:
 *                 the resulting mode is `simulated` or `degraded`.
 */
export async function runClaudeJson<T>(options: {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  fallback: () => T;
  maxTokens?: number;
  temperature?: number;
}): Promise<ClaudeJsonResult<T>> {
  const { system, prompt, schema, fallback } = options;

  if (!isClaudeConfigured()) {
    return {
      data: fallback(),
      meta: {
        mode: "simulated",
        model: "deterministic-composer",
        latencyMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        retries: 0,
        error: "ANTHROPIC_API_KEY not configured — deterministic composer used.",
      },
    };
  }

  const result = await completeWithRetry(
    system,
    prompt,
    options.maxTokens ?? ANTHROPIC_CONFIG.maxTokens,
    options.temperature ?? 0.3,
  );

  if (!result.completion) {
    return {
      data: fallback(),
      meta: {
        mode: "degraded",
        model: ANTHROPIC_CONFIG.model,
        latencyMs: result.latencyMs,
        inputTokens: 0,
        outputTokens: 0,
        retries: result.retries,
        error: result.error,
      },
    };
  }

  try {
    const parsed = schema.parse(extractJson(result.completion.text));
    return {
      data: parsed,
      meta: {
        mode: "live",
        model: result.completion.model,
        latencyMs: result.latencyMs,
        inputTokens: result.completion.inputTokens,
        outputTokens: result.completion.outputTokens,
        retries: result.retries,
        error: null,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Schema validation failed";
    console.error("[claude] response failed schema validation", { message });
    return {
      data: fallback(),
      meta: {
        mode: "degraded",
        model: result.completion.model,
        latencyMs: result.latencyMs,
        inputTokens: result.completion.inputTokens,
        outputTokens: result.completion.outputTokens,
        retries: result.retries,
        error: `Structured output rejected: ${message}`,
      },
    };
  }
}

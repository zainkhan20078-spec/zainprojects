import { db, type AILog, type AIProvider } from "./db";
import {
  acquireKey,
  ensureDefaultProviders,
  getProviderByName,
  markKeyRateLimited,
  markKeyUsed,
  type ProviderRegistry,
} from "./keyPool";
import { applyStylePass } from "./stylePass";

type Difficulty = "simple" | "medium" | "hard";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface MissingContextProvider {
  getPageContext: (pages: number[]) => Promise<string>;
}

export interface RouteRequest {
  prompt: string;
  notebookContext?: string;
  pageContextProvider?: MissingContextProvider;
}

export interface RouteResult {
  text: string;
  routeTaken: string;
  tokensUsed: number;
}

interface ModelCallOptions {
  provider: AIProvider;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
}

interface AIProviderAdapter {
  generate(options: Omit<ModelCallOptions, "provider"> & { baseUrl: string; apiKey: string }): Promise<string>;
}

const MAX_CONTEXT_RETRIES = 2;

function parseNeededPages(text: string): number[] {
  const match = text.match(/NEED_CONTEXT\s*\(?\s*pages?\s*[:=]\s*([0-9,\s-]+)\s*\)?/i);
  if (!match) {
    return [];
  }

  const bucket = new Set<number>();
  for (const token of match[1].split(",")) {
    const trimmed = token.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.includes("-")) {
      const [startRaw, endRaw] = trimmed.split("-").map((part) => Number(part.trim()));
      if (!Number.isFinite(startRaw) || !Number.isFinite(endRaw)) {
        continue;
      }
      const start = Math.max(1, Math.min(startRaw, endRaw));
      const end = Math.max(startRaw, endRaw);
      for (let value = start; value <= end; value += 1) {
        bucket.add(value);
      }
      continue;
    }

    const page = Number(trimmed);
    if (Number.isFinite(page) && page > 0) {
      bucket.add(page);
    }
  }

  return Array.from(bucket).sort((a, b) => a - b);
}

async function callGemini(baseUrl: string, apiKey: string, model: string, messages: ChatMessage[]): Promise<string> {
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  const response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({ contents }),
  });

  if (response.status === 429) {
    throw new Error("RATE_LIMIT_429");
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini call failed: ${text}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join(" ") ?? "";
}

async function callOpenAICompat(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  temperature = 0.2,
): Promise<string> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature }),
  });

  if (response.status === 429) {
    throw new Error("RATE_LIMIT_429");
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Model call failed: ${text}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return payload.choices?.[0]?.message?.content ?? "";
}

const GEMINI_ADAPTER: AIProviderAdapter = {
  generate: ({ baseUrl, apiKey, model, messages }) => callGemini(baseUrl, apiKey, model, messages),
};

const OPENAI_COMPATIBLE_ADAPTER: AIProviderAdapter = {
  generate: ({ baseUrl, apiKey, model, messages, temperature }) =>
    callOpenAICompat(baseUrl, apiKey, model, messages, temperature),
};

function createProviderAdapter(provider: AIProvider): AIProviderAdapter {
  const protocol = provider.protocol ?? (provider.name.toLowerCase() === "gemini" ? "gemini" : "openai-compatible");
  return protocol === "gemini" ? GEMINI_ADAPTER : OPENAI_COMPATIBLE_ADAPTER;
}

async function callModel(options: ModelCallOptions): Promise<string> {
  const key = await acquireKey(options.provider.id!);
  if (!key) {
    throw new Error(`No available API key for provider ${options.provider.name}.`);
  }

  try {
    const output = await createProviderAdapter(options.provider).generate({
      baseUrl: options.provider.baseUrl,
      apiKey: key.plainKey,
      model: options.model,
      messages: options.messages,
      temperature: options.temperature,
    });

    await markKeyUsed(key.row.id!);
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown model error";
    if (message.includes("RATE_LIMIT_429")) {
      await markKeyRateLimited(key.row.id!);
    }
    throw error;
  }
}

export async function generateWithProvider(
  provider: AIProvider,
  prompt: string,
  notebookContext?: string,
): Promise<RouteResult> {
  if (!provider.id) {
    throw new Error("Save the provider before sending a request.");
  }
  const model = provider.models[0];
  if (!model) {
    throw new Error(`No model is configured for ${provider.name}.`);
  }
  const contextPrefix = notebookContext?.trim() ? `Notebook context:\n${notebookContext.trim()}\n\n` : "";
  const text = await callModel({
    provider,
    model,
    messages: [{ role: "user", content: `${contextPrefix}Task:\n${prompt}` }],
  });
  return {
    text,
    routeTaken: `direct:${provider.name}:${model}`,
    tokensUsed: Math.ceil(prompt.length / 4),
  };
}

async function withMissingInfoLoop(params: {
  provider: AIProvider;
  model: string;
  baseMessages: ChatMessage[];
  pageContextProvider?: MissingContextProvider;
}): Promise<string> {
  let messages = [...params.baseMessages];
  let answer = await callModel({ provider: params.provider, model: params.model, messages });

  if (!params.pageContextProvider) {
    return answer;
  }

  for (let attempt = 0; attempt < MAX_CONTEXT_RETRIES; attempt += 1) {
    const pages = parseNeededPages(answer);
    if (pages.length === 0) {
      return answer;
    }

    const context = await params.pageContextProvider.getPageContext(pages);
    messages = [
      ...messages,
      { role: "assistant", content: answer },
      {
        role: "user",
        content: `Requested pages context (with neighbors):\n${context}\nUse this and answer fully now.`,
      },
    ];

    answer = await callModel({ provider: params.provider, model: params.model, messages });
  }

  return answer;
}

async function classifyDifficulty(gemini: AIProvider, prompt: string): Promise<Difficulty> {
  const raw = await callModel({
    provider: gemini,
    model: gemini.models[0],
    messages: [
      {
        role: "user",
        content: "Classify this request as SIMPLE, MEDIUM, or HARD. Return only one word.\nRequest:\n" + prompt,
      },
    ],
  });

  const value = raw.trim().toLowerCase();
  if (value.includes("hard")) return "hard";
  if (value.includes("medium")) return "medium";
  return "simple";
}

function pickModel(provider: AIProvider, fallback = 0): string {
  return provider.models[fallback] ?? provider.models[0];
}

async function getProviderByFallback(names: string[]): Promise<AIProvider> {
  await ensureDefaultProviders();

  for (const name of names) {
    const provider = await getProviderByName(name);
    if (provider?.id) {
      return provider;
    }
  }

  throw new Error("No provider available for requested route.");
}

async function logRoute(log: AILog): Promise<void> {
  await db.aiLogs.add(log);
}

export async function routeAIRequest(request: RouteRequest, _registry?: ProviderRegistry): Promise<RouteResult> {
  const gemini = await getProviderByFallback(["Gemini"]);
  const difficulty = await classifyDifficulty(gemini, request.prompt);

  const contextPrefix = request.notebookContext?.trim()
    ? `Notebook context:\n${request.notebookContext.trim()}\n\n`
    : "";

  const baseMessages: ChatMessage[] = [
    {
      role: "user",
      content: `${contextPrefix}Task:\n${request.prompt}`,
    },
  ];

  let finalRaw: string;
  let routeTaken: string;
  let tokensUsed = Math.ceil(request.prompt.length / 4);

  if (difficulty === "simple") {
    routeTaken = "simple:gemini-direct";
    finalRaw = await withMissingInfoLoop({
      provider: gemini,
      model: pickModel(gemini, 0),
      baseMessages,
      pageContextProvider: request.pageContextProvider,
    });
  } else if (difficulty === "medium") {
    const reasoner = await getProviderByFallback(["Groq", "OpenRouter", "Gemini"]);
    routeTaken = `medium:${reasoner.name.toLowerCase()}-single-reasoner`;
    finalRaw = await withMissingInfoLoop({
      provider: reasoner,
      model: pickModel(reasoner, 0),
      baseMessages,
      pageContextProvider: request.pageContextProvider,
    });
  } else {
    const reasonerA = await getProviderByFallback(["Groq", "OpenRouter", "Gemini"]);
    const reasonerB = await getProviderByFallback(["OpenRouter", "Groq", "Gemini"]);
    const judge = await getProviderByFallback(["Gemini", "Groq", "OpenRouter"]);

    const answerA = await withMissingInfoLoop({
      provider: reasonerA,
      model: pickModel(reasonerA, 0),
      baseMessages,
      pageContextProvider: request.pageContextProvider,
    });

    const answerB = await withMissingInfoLoop({
      provider: reasonerB,
      model: pickModel(reasonerB, 0),
      baseMessages,
      pageContextProvider: request.pageContextProvider,
    });

    const critiqueA = await callModel({
      provider: reasonerA,
      model: pickModel(reasonerA, 0),
      messages: [{ role: "user", content: `Critique this answer and list issues:\n${answerB}` }],
    });

    const critiqueB = await callModel({
      provider: reasonerB,
      model: pickModel(reasonerB, 0),
      messages: [{ role: "user", content: `Critique this answer and list issues:\n${answerA}` }],
    });

    finalRaw = await callModel({
      provider: judge,
      model: pickModel(judge, 0),
      messages: [
        {
          role: "user",
          content: [
            "You are the final judge. Build one best answer using two drafts and their critiques.",
            `Draft A:\n${answerA}`,
            `Draft B:\n${answerB}`,
            `Critique of A:\n${critiqueB}`,
            `Critique of B:\n${critiqueA}`,
            "Return only the final answer.",
          ].join("\n\n"),
        },
      ],
    });

    routeTaken = `hard:${reasonerA.name.toLowerCase()}+${reasonerB.name.toLowerCase()}->${judge.name.toLowerCase()}-judge`;
    tokensUsed += Math.ceil((answerA.length + answerB.length + critiqueA.length + critiqueB.length) / 4);
  }

  const styled = await applyStylePass(finalRaw, async (prompt) =>
    callModel({ provider: gemini, model: pickModel(gemini, 1), messages: [{ role: "user", content: prompt }] }),
  );

  tokensUsed += Math.ceil((finalRaw.length + styled.length) / 4);

  await logRoute({
    prompt: request.prompt,
    routeTaken,
    tokensUsed,
    timestamp: Date.now(),
  });

  return {
    text: styled,
    routeTaken,
    tokensUsed,
  };
}

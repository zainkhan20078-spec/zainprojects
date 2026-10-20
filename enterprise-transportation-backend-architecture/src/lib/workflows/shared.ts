/**
 * Shared workflow primitives: run lifecycle accounting and knowledge loading.
 */
import { and, asc, eq, isNotNull, desc } from "drizzle-orm";
import { db } from "@/db";
import { knowledgeDocuments, webhookEvents, workflowRuns } from "@/db/schema";
import type { ClaudeMeta } from "@/lib/claude/client";
import type { KnowledgeContext } from "@/lib/claude/prompts";
import { getPricingRules, normaliseRule, type PricingRule } from "@/lib/pricing";

export type RunMode = "live" | "simulated" | "degraded";
export type WorkflowModule = "A" | "B" | "C";
export type RunRecord = typeof workflowRuns.$inferSelect;

export async function startRun(input: {
  module: WorkflowModule;
  trigger: "webhook" | "cron" | "manual";
  eventId?: string | null;
}): Promise<RunRecord> {
  const [row] = await db
    .insert(workflowRuns)
    .values({
      module: input.module,
      trigger: input.trigger,
      eventId: input.eventId ?? null,
      status: "running",
      mode: "simulated",
    })
    .returning();
  return row;
}

const clampMode = (mode: ClaudeMeta["mode"]): RunMode =>
  mode === "live" ? "live" : mode === "degraded" ? "degraded" : "simulated";

export async function finishRun(
  runId: string,
  input: {
    summary: string;
    meta: ClaudeMeta;
    output?: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .update(workflowRuns)
    .set({
      status: "succeeded",
      mode: clampMode(input.meta.mode),
      model: input.meta.model,
      latencyMs: input.meta.latencyMs,
      inputTokens: input.meta.inputTokens,
      outputTokens: input.meta.outputTokens,
      retries: input.meta.retries,
      summary: input.summary,
      error: input.meta.error,
      output: input.output ?? {},
      finishedAt: new Date(),
    })
    .where(eq(workflowRuns.id, runId));
}

export async function failRun(runId: string, error: unknown, summary?: string): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db
    .update(workflowRuns)
    .set({
      status: "failed",
      error: message.slice(0, 1200),
      summary: summary ?? "Workflow failed during execution.",
      finishedAt: new Date(),
    })
    .where(eq(workflowRuns.id, runId));
}

export async function skipRun(
  runId: string,
  summary: string,
  output?: Record<string, unknown>,
): Promise<void> {
  await db
    .update(workflowRuns)
    .set({ status: "skipped", summary, output: output ?? {}, finishedAt: new Date() })
    .where(eq(workflowRuns.id, runId));
}

/** Active Claude Project knowledge, ordered instructions first. */
export async function loadKnowledgeContext(): Promise<KnowledgeContext[]> {
  const rows = await db
    .select({
      slug: knowledgeDocuments.slug,
      name: knowledgeDocuments.name,
      xmlContent: knowledgeDocuments.xmlContent,
      category: knowledgeDocuments.category,
    })
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.isActive, true))
    .orderBy(asc(knowledgeDocuments.category), asc(knowledgeDocuments.slug));

  return rows.map((row) => ({ slug: row.slug, name: row.name, xmlContent: row.xmlContent }));
}

export async function loadPricingRules(): Promise<PricingRule[]> {
  return getPricingRules();
}

export async function markEvent(
  eventRowId: string,
  patch: {
    status: "processed" | "failed" | "skipped";
    routing?: string;
    error?: string | null;
    normalized?: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .update(webhookEvents)
    .set({
      status: patch.status,
      routing: patch.routing,
      error: patch.error ?? null,
      normalized: patch.normalized,
      processedAt: new Date(),
      attempts: 1,
    })
    .where(eq(webhookEvents.id, eventRowId));
}

export async function findEventsPending(): Promise<Array<typeof webhookEvents.$inferSelect>> {
  return db
    .select()
    .from(webhookEvents)
    .where(and(eq(webhookEvents.status, "failed"), isNotNull(webhookEvents.id)))
    .orderBy(desc(webhookEvents.receivedAt))
    .limit(20);
}

export const rulesAsObject = (rules: PricingRule[]): Record<string, unknown>[] =>
  rules.map((rule) => ({ ...normaliseRule(rule) }));

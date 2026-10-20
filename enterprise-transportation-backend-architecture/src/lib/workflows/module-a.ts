/**
 * MODULE A — Instant Luxury Quote Drafting
 *
 * Quote.Requested / Reservation.Created
 *   → deterministic pricing guardrail
 *   → Claude concierge draft (JSON validated)
 *   → Gmail DRAFT (never sent)
 *   → artefact persisted for dispatch review
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reservations } from "@/db/schema";
import { runClaudeJson } from "@/lib/claude/client";
import { fallbackQuoteDraft } from "@/lib/claude/fallbacks";
import {
  buildQuoteDraftPrompt,
  buildSystemPrompt,
  emailDraftSchema,
  type EmailDraft,
} from "@/lib/claude/prompts";
import { BRAND } from "@/lib/config";
import type { NormalizedQuoteEvent } from "@/lib/events";
import { createGmailDraft } from "@/lib/integrations/google";
import { recordArtifact } from "@/lib/artifacts";
import type { QuoteBreakdown } from "@/lib/pricing";
import { failRun, finishRun, loadKnowledgeContext, startRun, type RunMode } from "@/lib/workflows/shared";

export type ModuleAResult = {
  runId: string;
  status: "succeeded" | "failed";
  summary: string;
  draft: EmailDraft;
  mode: RunMode;
};

export async function runModuleA(input: {
  providerEventId: string;
  reservation: NormalizedQuoteEvent;
  reservationRowId: string;
  breakdown: QuoteBreakdown;
}): Promise<ModuleAResult> {
  const run = await startRun({ module: "A", trigger: "webhook", eventId: input.providerEventId });

  try {
    const knowledge = await loadKnowledgeContext();
    const { prompt } = buildQuoteDraftPrompt(input.reservation, input.breakdown);
    const system = buildSystemPrompt(knowledge);

    const { data: draft, meta } = await runClaudeJson<EmailDraft>({
      system,
      prompt,
      schema: emailDraftSchema,
      fallback: () => fallbackQuoteDraft(input.reservation, input.breakdown),
      maxTokens: 1800,
      temperature: 0.35,
    });

    const recipient = input.reservation.passengerEmail ?? BRAND.dispatchEmail;
    const delivery = await createGmailDraft({
      to: recipient,
      subject: draft.subject,
      body: draft.body,
    });

    await recordArtifact({
      runId: run.id,
      kind: "gmail_draft",
      provider: "google",
      target: delivery.target,
      title: draft.subject,
      body: draft.body,
      reference: delivery.reference,
      url: delivery.url,
      mode: delivery.mode,
      metadata: {
        module: "A",
        recipient,
        passenger: input.reservation.passengerName,
        reservationRowId: input.reservationRowId,
        providerEventId: input.providerEventId,
        guardrail: input.breakdown.guardrail,
        total: input.breakdown.total,
        riskFlags: draft.risk_flags ?? [],
        internalNote: draft.internal_note ?? "",
        claudeMode: meta.mode,
        model: meta.model,
        inputTokens: meta.inputTokens,
        outputTokens: meta.outputTokens,
        retries: meta.retries,
        latencyMs: meta.latencyMs,
      },
    });

    await db
      .update(reservations)
      .set({ status: "quote_drafted" })
      .where(eq(reservations.id, input.reservationRowId));

    const summary = `Quote draft prepared for ${input.reservation.passengerName} · $${input.breakdown.total.toFixed(2)} · guardrail ${input.breakdown.guardrail}`;
    await finishRun(run.id, {
      summary,
      meta,
      output: {
        subject: draft.subject,
        recipient,
        guardrail: input.breakdown.guardrail,
        total: input.breakdown.total,
        internalNote: draft.internal_note ?? "",
        riskFlags: draft.risk_flags ?? [],
        draftReference: delivery.reference,
        deliveryMode: delivery.mode,
      },
    });

    return { runId: run.id, status: "succeeded", summary, draft, mode: meta.mode };
  } catch (error) {
    await failRun(run.id, error, "Quote draft workflow failed before Gmail draft creation.");
    throw error;
  }
}

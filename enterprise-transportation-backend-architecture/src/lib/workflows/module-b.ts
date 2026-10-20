/**
 * MODULE B — Accounts Receivable Corporate Escalation
 *
 * Triggered by Invoice.PastDue webhooks or the scheduled AR sweep once
 * days_past_due exceeds the configured threshold (default 30).
 *   → Claude escalation draft (JSON validated)
 *   → Gmail DRAFT for the controller
 *   → high-priority Slack card in #ar-alerts with a link to the draft
 *   → invoice status moves to `escalated`
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { runClaudeJson } from "@/lib/claude/client";
import { fallbackArDraft } from "@/lib/claude/fallbacks";
import {
  arEscalationSchema,
  buildArEscalationPrompt,
  buildSystemPrompt,
  type ArEscalationDraft,
} from "@/lib/claude/prompts";
import { BRAND, WORKFLOW_CONFIG } from "@/lib/config";
import { artifactUrl, recordArtifact } from "@/lib/artifacts";
import type { NormalizedInvoiceEvent } from "@/lib/events";
import { createGmailDraft } from "@/lib/integrations/google";
import {
  buildArEscalationBlocks,
  postSlackMessage,
  resolveChannel,
} from "@/lib/integrations/slack";
import { formatUsd } from "@/lib/pricing";
import { failRun, finishRun, loadKnowledgeContext, startRun, type RunMode } from "@/lib/workflows/shared";

export type ModuleBResult = {
  runId: string;
  status: "succeeded" | "skipped";
  mode: RunMode;
  summary: string;
  draft?: ArEscalationDraft;
};

export async function runModuleB(input: {
  providerEventId: string;
  invoice: typeof invoices.$inferSelect;
  relationshipYears: number;
  trigger: "webhook" | "cron" | "manual";
}): Promise<ModuleBResult> {
  const run = await startRun({
    module: "B",
    trigger: input.trigger,
    eventId: input.providerEventId,
  });

  const threshold = WORKFLOW_CONFIG.arEscalationDays;
  if (input.invoice.daysPastDue <= threshold) {
    const summary = `Invoice ${input.invoice.invoiceNumber} is ${input.invoice.daysPastDue} days past due — below the ${threshold}-day escalation threshold. Monitoring only.`;
    await finishRun(run.id, {
      summary,
      meta: {
        mode: "simulated",
        model: "policy-gate",
        latencyMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        retries: 0,
        error: null,
      },
      output: { skipped: true, daysPastDue: input.invoice.daysPastDue, threshold },
    });
    return { runId: run.id, status: "skipped", mode: "simulated", summary };
  }

  try {
    const receipt = {
      corporateName: input.invoice.corporateName,
      billingContactEmail: input.invoice.billingContactEmail,
      invoiceNumber: input.invoice.invoiceNumber,
      balanceDue: Number.parseFloat(input.invoice.balanceDue),
      daysPastDue: input.invoice.daysPastDue,
      dueDate: input.invoice.dueDate ? input.invoice.dueDate.toISOString() : null,
      relationshipYears: input.relationshipYears,
    };

    const knowledge = await loadKnowledgeContext();
    const system = buildSystemPrompt(knowledge);
    const { prompt } = buildArEscalationPrompt(receipt);

    const { data: draft, meta } = await runClaudeJson<ArEscalationDraft>({
      system,
      prompt,
      schema: arEscalationSchema,
      fallback: () => fallbackArDraft(receipt),
      maxTokens: 1400,
      temperature: 0.25,
    });

    const delivery = await createGmailDraft({
      to: input.invoice.billingContactEmail,
      subject: draft.subject,
      body: draft.body,
      cc: BRAND.dispatchEmail,
    });

    const draftArtifact = await recordArtifact({
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
        module: "B",
        escalationLevel: draft.escalation_level,
        invoiceNumber: input.invoice.invoiceNumber,
        corporateName: input.invoice.corporateName,
        balanceDue: receipt.balanceDue,
        daysPastDue: receipt.daysPastDue,
        recipient: input.invoice.billingContactEmail,
        recommendedActions: draft.recommended_actions ?? [],
        claudeMode: meta.mode,
        model: meta.model,
        inputTokens: meta.inputTokens,
        outputTokens: meta.outputTokens,
      },
    });

    const alertText = `AR escalation — ${input.invoice.corporateName} · Invoice ${input.invoice.invoiceNumber} · ${formatUsd(receipt.balanceDue)} · ${receipt.daysPastDue} days past due (${draft.escalation_level}). Draft: ${draft.subject}`;

    const slack = await postSlackMessage({
      target: "ar",
      text: alertText,
      blocks: buildArEscalationBlocks({
        corporateName: input.invoice.corporateName,
        invoiceNumber: input.invoice.invoiceNumber,
        balanceDue: formatUsd(receipt.balanceDue),
        daysPastDue: receipt.daysPastDue,
        escalationLevel: draft.escalation_level,
        draftUrl: artifactUrl(draftArtifact.id),
        gmailUrl: delivery.url,
      }),
    });

    await recordArtifact({
      runId: run.id,
      kind: "slack_message",
      provider: "slack",
      target: slack.channel,
      title: `AR escalation — ${input.invoice.corporateName}`,
      body: `${alertText}\n\nDraft console link: ${artifactUrl(draftArtifact.id)}`,
      reference: slack.reference,
      url: null,
      mode: slack.mode,
      metadata: {
        module: "B",
        channelResolved: resolveChannel("ar"),
        invoiceNumber: input.invoice.invoiceNumber,
        draftArtifactId: draftArtifact.id,
        escalationLevel: draft.escalation_level,
      },
    });

    await db
      .update(invoices)
      .set({ status: "escalated", lastEventAt: new Date() })
      .where(eq(invoices.id, input.invoice.id));

    const summary = `AR escalation drafted for ${input.invoice.corporateName} (${draft.escalation_level}) · ${formatUsd(receipt.balanceDue)} · ${receipt.daysPastDue} days past due`;
    await finishRun(run.id, {
      summary,
      meta,
      output: {
        subject: draft.subject,
        escalationLevel: draft.escalation_level,
        balanceDue: receipt.balanceDue,
        daysPastDue: receipt.daysPastDue,
        recipient: receipt.billingContactEmail,
        recommendedActions: draft.recommended_actions ?? [],
        draftReference: delivery.reference,
        slackReference: slack.reference,
        draftArtifactId: draftArtifact.id,
      },
    });

    return { runId: run.id, status: "succeeded", mode: meta.mode, summary, draft };
  } catch (error) {
    await failRun(run.id, error, "AR escalation workflow failed.");
    throw error;
  }
}

/** Used by the webhook pipeline to persist/refresh receivable state. */
export async function upsertInvoice(invoice: NormalizedInvoiceEvent): Promise<typeof invoices.$inferSelect> {
  const existing = await db.select().from(invoices).where(eq(invoices.externalId, invoice.externalId)).limit(1);
  if (existing[0]) {
    const [updated] = await db
      .update(invoices)
      .set({
        balanceDue: invoice.balanceDue.toFixed(2),
        daysPastDue: invoice.daysPastDue,
        billingContactEmail: invoice.billingContactEmail,
        corporateName: invoice.corporateName,
        invoiceNumber: invoice.invoiceNumber,
        dueDate: invoice.dueDate ? new Date(invoice.dueDate) : existing[0].dueDate,
        lastEventAt: new Date(),
      })
      .where(eq(invoices.id, existing[0].id))
      .returning();
    return updated;
  }

  const [inserted] = await db
    .insert(invoices)
    .values({
      externalId: invoice.externalId,
      invoiceNumber: invoice.invoiceNumber,
      corporateName: invoice.corporateName,
      billingContactEmail: invoice.billingContactEmail,
      balanceDue: invoice.balanceDue.toFixed(2),
      daysPastDue: invoice.daysPastDue,
      dueDate: invoice.dueDate ? new Date(invoice.dueDate) : null,
      status: "tracked",
    })
    .returning();
  return inserted;
}

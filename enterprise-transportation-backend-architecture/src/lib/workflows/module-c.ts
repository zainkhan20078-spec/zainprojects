/**
 * MODULE C — Automated Daily Dispatch Summary & Quality Audit
 *
 * Triggered by cron (`/api/cron/daily-audit`) or manually from the console.
 *   → 24h batch: inquiries, phone transcripts, completed shifts, automation KPIs
 *   → Claude multi-task audit (tone grade, response-time grade, anomalies, KPIs)
 *   → Google Sheets row appended
 *   → executive summary posted to #daily-dispatch-log
 */
import { and, count, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  artifacts,
  communicationLogs,
  dispatchAudits,
  reservations,
  shifts,
  webhookEvents,
} from "@/db/schema";
import { runClaudeJson } from "@/lib/claude/client";
import { fallbackDispatchAudit } from "@/lib/claude/fallbacks";
import {
  buildDailyAuditPrompt,
  buildSystemPrompt,
  dispatchAuditSchema,
  type DispatchAuditOutput,
  type DispatchBatch,
} from "@/lib/claude/prompts";
import { BRAND, SLACK_CONFIG, WORKFLOW_CONFIG } from "@/lib/config";
import { recordArtifact } from "@/lib/artifacts";
import { appendAuditRow } from "@/lib/integrations/google";
import { buildDispatchAuditBlocks, postSlackMessage, resolveChannel } from "@/lib/integrations/slack";
import { formatUsd } from "@/lib/pricing";
import { failRun, finishRun, loadKnowledgeContext, startRun, type RunMode } from "@/lib/workflows/shared";

/** Fixed column contract for the `Daily Dispatch Audit` sheet tab. */
export const AUDIT_SHEET_COLUMNS = [
  "audit_date",
  "window_start",
  "window_end",
  "total_trips",
  "revenue_estimate",
  "inquiries",
  "drafts_created",
  "tone_score",
  "tone_grade",
  "response_grade",
  "avg_response_seconds",
  "anomalies_critical",
  "anomalies_elevated",
  "anomalies_watch",
  "overall_score",
  "executive_summary",
  "recommendations",
  "automation_mode",
  "run_id",
] as const;

/** Guard against spreadsheet formula injection. */
const sheetCell = (value: string | number): string | number => {
  if (typeof value === "number") return value;
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
};

const countRows = async (rowCount: number): Promise<number> => rowCount;

/** Build the last-24h dispatch batch from Postgres. */
export async function buildDispatchBatch(lookbackHours = WORKFLOW_CONFIG.auditLookbackHours): Promise<DispatchBatch> {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const until = new Date();
  const arChannel = resolveChannel("ar");

  const [comms, shiftRows, quoteCount, draftCount, arCount, failedCount] = await Promise.all([
    db
      .select()
      .from(communicationLogs)
      .where(gte(communicationLogs.receivedAt, since))
      .orderBy(desc(communicationLogs.receivedAt))
      .limit(150),
    db.select().from(shifts).where(gte(shifts.completedAt, since)).orderBy(desc(shifts.completedAt)).limit(80),
    db
      .select({ value: count() })
      .from(reservations)
      .where(gte(reservations.createdAt, since)),
    db
      .select({ value: count() })
      .from(artifacts)
      .where(and(eq(artifacts.kind, "gmail_draft"), gte(artifacts.createdAt, since))),
    db
      .select({ value: count() })
      .from(artifacts)
      .where(
        and(
          eq(artifacts.kind, "slack_message"),
          eq(artifacts.target, arChannel),
          gte(artifacts.createdAt, since),
        ),
      ),
    db
      .select({ value: count() })
      .from(webhookEvents)
      .where(and(eq(webhookEvents.status, "failed"), gte(webhookEvents.receivedAt, since))),
  ]);

  return {
    windowStart: since.toISOString(),
    windowEnd: until.toISOString(),
    inquiries: comms
      .filter((row) => row.channel === "email")
      .map((row) => ({
        channel: row.channel,
        customer_name: row.customerName,
        subject: row.subject,
        content: row.content,
        response_time_seconds: row.responseTimeSeconds,
        received_at: row.receivedAt.toISOString(),
      })),
    phone_transcripts: comms
      .filter((row) => row.channel === "phone")
      .map((row) => ({
        customer_name: row.customerName,
        subject: row.subject,
        content: row.content,
        response_time_seconds: row.responseTimeSeconds,
        received_at: row.receivedAt.toISOString(),
      })),
    shifts: shiftRows.map((row) => ({
      driver_id: row.driverId,
      driver_name: row.driverName,
      trips_completed: row.tripsCompleted,
      total_revenue: Number.parseFloat(row.totalRevenue),
      incident_flags: row.incidentFlags,
      completed_at: row.completedAt.toISOString(),
    })),
    operational_context: {
      quotes_processed: await countRows(quoteCount[0]?.value ?? 0),
      drafts_created: await countRows(draftCount[0]?.value ?? 0),
      ar_escalations: await countRows(arCount[0]?.value ?? 0),
      failed_events: await countRows(failedCount[0]?.value ?? 0),
    },
  };
}

export type ModuleCResult = {
  runId: string;
  status: "succeeded" | "failed";
  mode: RunMode;
  summary: string;
  audit: DispatchAuditOutput;
  batch: DispatchBatch;
};

export async function runModuleC(input: {
  trigger: "cron" | "manual";
  batch?: DispatchBatch;
}): Promise<ModuleCResult> {
  const run = await startRun({ module: "C", trigger: input.trigger, eventId: null });

  try {
    const batch = input.batch ?? (await buildDispatchBatch());
    const knowledge = await loadKnowledgeContext();
    const system = buildSystemPrompt(knowledge);
    const { prompt } = buildDailyAuditPrompt(batch);

    const { data: audit, meta } = await runClaudeJson<DispatchAuditOutput>({
      system,
      prompt,
      schema: dispatchAuditSchema,
      fallback: () => fallbackDispatchAudit(batch),
      maxTokens: 2000,
      temperature: 0.2,
    });

    const auditDateIso = new Date().toISOString();
    const critical = audit.anomalies.filter((item) => item.severity === "critical").length;
    const elevated = audit.anomalies.filter((item) => item.severity === "elevated").length;
    const watch = audit.anomalies.filter((item) => item.severity === "watch").length;

    const row: Array<string | number> = [
      auditDateIso,
      batch.windowStart,
      batch.windowEnd,
      audit.kpis.total_trips,
      Math.round(audit.kpis.revenue_estimate * 100) / 100,
      audit.kpis.inquiries,
      audit.kpis.drafts_created,
      audit.tone.score,
      audit.tone.grade,
      audit.response_time.grade,
      audit.response_time.average_seconds,
      critical,
      elevated,
      watch,
      audit.overall_score,
      audit.executive_summary,
      audit.recommendations.join(" | "),
      meta.mode,
      run.id,
    ].map((cell) => sheetCell(cell));

    const sheetDelivery = await appendAuditRow(row.map(String));

    const sheetsArtifact = await recordArtifact({
      runId: run.id,
      kind: "sheets_row",
      provider: "google",
      target: sheetDelivery.target,
      title: `Daily dispatch audit — ${new Date(auditDateIso).toLocaleDateString("en-US")}`,
      body: JSON.stringify(
        Object.fromEntries(AUDIT_SHEET_COLUMNS.map((column, index) => [column, row[index]])),
        null,
        2,
      ),
      reference: sheetDelivery.reference,
      url: sheetDelivery.url,
      mode: sheetDelivery.mode,
      metadata: {
        module: "C",
        columns: [...AUDIT_SHEET_COLUMNS],
        rowsWritten: 1,
        overallScore: audit.overall_score,
        claudeMode: meta.mode,
        model: meta.model,
        inputTokens: meta.inputTokens,
        outputTokens: meta.outputTokens,
        retries: meta.retries,
        latencyMs: meta.latencyMs,
      },
    });

    const executiveText = `Daily Dispatch Audit · ${new Date(auditDateIso).toLocaleDateString("en-US")} · ${audit.kpis.total_trips} trips · ${formatUsd(audit.kpis.revenue_estimate)} · tone ${audit.tone.score}/5 · ${audit.anomalies.length} anomalies\n${audit.executive_summary}`;

    const slack = await postSlackMessage({
      target: "dispatch",
      text: executiveText,
      blocks: buildDispatchAuditBlocks({
        auditDate: new Date(auditDateIso).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        totalTrips: audit.kpis.total_trips,
        revenue: formatUsd(audit.kpis.revenue_estimate),
        toneScore: audit.tone.score.toFixed(1),
        responseGrade: audit.response_time.grade,
        anomalies: audit.anomalies.length,
        summary: audit.executive_summary,
        sheetReference: sheetsArtifact.reference,
      }),
    });

    await recordArtifact({
      runId: run.id,
      kind: "slack_message",
      provider: "slack",
      target: slack.channel || SLACK_CONFIG.dispatchChannel,
      title: `Daily dispatch executive summary — ${new Date(auditDateIso).toLocaleDateString("en-US")}`,
      body: executiveText,
      reference: slack.reference,
      url: null,
      mode: slack.mode,
      metadata: {
        module: "C",
        channelResolved: resolveChannel("dispatch"),
        sheetArtifactId: sheetsArtifact.id,
        anomalies: audit.anomalies,
        recommendations: audit.recommendations,
      },
    });

    await db.insert(dispatchAudits).values({
      runId: run.id,
      auditDate: new Date(auditDateIso),
      toneScore: audit.tone.score.toFixed(1),
      responseTimeGrade: audit.response_time.grade,
      overallScore: audit.overall_score.toFixed(1),
      kpis: {
        ...batch.operational_context,
        total_trips: audit.kpis.total_trips,
        revenue_estimate: audit.kpis.revenue_estimate,
        inquiries: audit.kpis.inquiries,
        drafts_created: audit.kpis.drafts_created,
      },
      anomalies: audit.anomalies,
      narrative: audit.executive_summary,
    });

    const summary = `Daily audit complete · ${audit.kpis.total_trips} trips · ${formatUsd(audit.kpis.revenue_estimate)} · tone ${audit.tone.score}/5 · ${audit.anomalies.length} anomalies`;
    await finishRun(run.id, {
      summary,
      meta,
      output: {
        tone: audit.tone,
        responseTime: audit.response_time,
        kpis: audit.kpis,
        anomalies: audit.anomalies,
        recommendations: audit.recommendations,
        overallScore: audit.overall_score,
        sheetReference: sheetsArtifact.reference,
        slackReference: slack.reference,
      },
    });

    return { runId: run.id, status: "succeeded", mode: meta.mode, summary, audit, batch };
  } catch (error) {
    await failRun(run.id, error, `Daily dispatch audit failed for ${BRAND.name}.`);
    throw error;
  }
}

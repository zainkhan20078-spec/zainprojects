/**
 * Read model for the operations console. All queries are intentionally explicit
 * so the dashboard cost stays predictable as volume grows.
 */
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  artifacts,
  communicationLogs,
  dispatchAudits,
  invoices,
  knowledgeDocuments,
  pricingRules,
  reservations,
  shifts,
  webhookEvents,
  workflowRuns,
} from "@/db/schema";
import { ensureSeeded } from "@/lib/bootstrap";
import { INTEGRATION_STATUS, WORKFLOW_CONFIG } from "@/lib/config";

export type EventRow = typeof webhookEvents.$inferSelect;
export type RunRow = typeof workflowRuns.$inferSelect;
export type ArtifactRow = typeof artifacts.$inferSelect;

const since24h = (): Date => new Date(Date.now() - 24 * 60 * 60 * 1000);

const scalar = async (query: Promise<Array<{ value: number | string | null }>>): Promise<number> => {
  const [row] = await query;
  const value = row?.value ?? 0;
  return typeof value === "string" ? Number.parseFloat(value) || 0 : value;
};

export type DashboardMetrics = {
  events24h: number;
  eventsFailed: number;
  eventsProcessed: number;
  runs24h: number;
  runsSucceeded: number;
  runsFailed: number;
  avgLatencyMs: number;
  tokensUsed: number;
  drafts: number;
  slackMessages: number;
  auditRows: number;
  escalatedInvoices: number;
  outstandingBalance: number;
  totalTrips: number;
  totalRevenue: number;
  quotes: number;
  knowledgeArtifacts: number;
  thresholds: { arEscalationDays: number };
  integrations: typeof INTEGRATION_STATUS;
};

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  await ensureSeeded();
  const window = since24h();

  const [
    events24h,
    eventsFailed,
    eventsProcessed,
    runs24h,
    runsSucceeded,
    runsFailed,
    avgLatency,
    tokens,
    drafts,
    slackMessages,
    auditRows,
    escalatedInvoices,
    outstanding,
    trips,
    revenue,
    quotes,
    knowledge,
  ] = await Promise.all([
    scalar(db.select({ value: count() }).from(webhookEvents).where(gte(webhookEvents.receivedAt, window))),
    scalar(
      db
        .select({ value: count() })
        .from(webhookEvents)
        .where(and(eq(webhookEvents.status, "failed"), gte(webhookEvents.receivedAt, window))),
    ),
    scalar(
      db
        .select({ value: count() })
        .from(webhookEvents)
        .where(and(eq(webhookEvents.status, "processed"), gte(webhookEvents.receivedAt, window))),
    ),
    scalar(db.select({ value: count() }).from(workflowRuns).where(gte(workflowRuns.startedAt, window))),
    scalar(
      db
        .select({ value: count() })
        .from(workflowRuns)
        .where(and(eq(workflowRuns.status, "succeeded"), gte(workflowRuns.startedAt, window))),
    ),
    scalar(
      db
        .select({ value: count() })
        .from(workflowRuns)
        .where(and(eq(workflowRuns.status, "failed"), gte(workflowRuns.startedAt, window))),
    ),
    scalar(
      db
        .select({ value: sql<string>`coalesce(avg(${workflowRuns.latencyMs}), 0)` })
        .from(workflowRuns)
        .where(gte(workflowRuns.startedAt, window)),
    ),
    scalar(
      db
        .select({
          value: sql<string>`coalesce(sum(${workflowRuns.inputTokens} + ${workflowRuns.outputTokens}), 0)`,
        })
        .from(workflowRuns),
    ),
    scalar(db.select({ value: count() }).from(artifacts).where(eq(artifacts.kind, "gmail_draft"))),
    scalar(db.select({ value: count() }).from(artifacts).where(eq(artifacts.kind, "slack_message"))),
    scalar(db.select({ value: count() }).from(artifacts).where(eq(artifacts.kind, "sheets_row"))),
    scalar(db.select({ value: count() }).from(invoices).where(eq(invoices.status, "escalated"))),
    scalar(
      db
        .select({ value: sql<string>`coalesce(sum(${invoices.balanceDue}), 0)` })
        .from(invoices)
        .where(sql`${invoices.status} <> 'resolved'`),
    ),
    scalar(db.select({ value: sql<string>`coalesce(sum(${shifts.tripsCompleted}), 0)` }).from(shifts)),
    scalar(db.select({ value: sql<string>`coalesce(sum(${shifts.totalRevenue}), 0)` }).from(shifts)),
    scalar(db.select({ value: count() }).from(reservations)),
    scalar(
      db
        .select({ value: count() })
        .from(knowledgeDocuments)
        .where(eq(knowledgeDocuments.isActive, true)),
    ),
  ]);

  return {
    events24h,
    eventsFailed,
    eventsProcessed,
    runs24h,
    runsSucceeded,
    runsFailed,
    avgLatencyMs: Math.round(avgLatency),
    tokensUsed: Math.round(tokens),
    drafts,
    slackMessages,
    auditRows,
    escalatedInvoices,
    outstandingBalance: outstanding,
    totalTrips: trips,
    totalRevenue: revenue,
    quotes,
    knowledgeArtifacts: knowledge,
    thresholds: { arEscalationDays: WORKFLOW_CONFIG.arEscalationDays },
    integrations: INTEGRATION_STATUS,
  };
}

export async function listEvents(limit = 40): Promise<EventRow[]> {
  await ensureSeeded();
  return db.select().from(webhookEvents).orderBy(desc(webhookEvents.receivedAt)).limit(limit);
}

export async function getEvent(id: string): Promise<{
  event: EventRow | null;
  runs: RunRow[];
  artifacts: ArtifactRow[];
}> {
  await ensureSeeded();
  const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, id)).limit(1);
  if (!event) return { event: null, runs: [], artifacts: [] };
  const runs = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.eventId, event.eventId))
    .orderBy(desc(workflowRuns.startedAt));
  const runIds = runs.map((run) => run.id);
  const relatedArtifacts =
    runIds.length > 0
      ? await db
          .select()
          .from(artifacts)
          .where(inArray(artifacts.runId, runIds))
          .orderBy(desc(artifacts.createdAt))
      : [];
  return { event, runs, artifacts: relatedArtifacts };
}

export async function listRuns(limit = 40): Promise<RunRow[]> {
  await ensureSeeded();
  return db.select().from(workflowRuns).orderBy(desc(workflowRuns.startedAt)).limit(limit);
}

export async function getRun(id: string): Promise<{
  run: RunRow | null;
  artifacts: ArtifactRow[];
}> {
  await ensureSeeded();
  const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).limit(1);
  if (!run) return { run: null, artifacts: [] };
  const rows = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.runId, id))
    .orderBy(desc(artifacts.createdAt));
  return { run, artifacts: rows };
}

export async function listArtifacts(limit = 60): Promise<ArtifactRow[]> {
  await ensureSeeded();
  return db.select().from(artifacts).orderBy(desc(artifacts.createdAt)).limit(limit);
}

export async function getArtifact(id: string): Promise<ArtifactRow | null> {
  await ensureSeeded();
  const [row] = await db.select().from(artifacts).where(eq(artifacts.id, id)).limit(1);
  return row ?? null;
}

export async function listReservations(limit = 20): Promise<Array<typeof reservations.$inferSelect>> {
  await ensureSeeded();
  return db.select().from(reservations).orderBy(desc(reservations.createdAt)).limit(limit);
}

export async function listInvoices(): Promise<Array<typeof invoices.$inferSelect>> {
  await ensureSeeded();
  return db.select().from(invoices).orderBy(desc(invoices.daysPastDue)).limit(40);
}

export async function listShifts(limit = 20): Promise<Array<typeof shifts.$inferSelect>> {
  await ensureSeeded();
  return db.select().from(shifts).orderBy(desc(shifts.completedAt)).limit(limit);
}

export async function listAudits(limit = 10): Promise<Array<typeof dispatchAudits.$inferSelect>> {
  await ensureSeeded();
  return db.select().from(dispatchAudits).orderBy(desc(dispatchAudits.auditDate)).limit(limit);
}

export async function listKnowledge(): Promise<Array<typeof knowledgeDocuments.$inferSelect>> {
  await ensureSeeded();
  return db
    .select()
    .from(knowledgeDocuments)
    .orderBy(knowledgeDocuments.category, knowledgeDocuments.name);
}

export async function listPricingRules(): Promise<Array<typeof pricingRules.$inferSelect>> {
  await ensureSeeded();
  return db.select().from(pricingRules).orderBy(pricingRules.vehicleClass);
}

export async function listCommunications(limit = 12): Promise<Array<typeof communicationLogs.$inferSelect>> {
  await ensureSeeded();
  return db
    .select()
    .from(communicationLogs)
    .orderBy(desc(communicationLogs.receivedAt))
    .limit(limit);
}

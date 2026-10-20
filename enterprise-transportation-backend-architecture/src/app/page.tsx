import Link from "next/link";
import { ApiActionButton, EventSimulator } from "@/components/interactive";
import {
  Badge,
  Empty,
  Metric,
  PageHeader,
  Panel,
  StatusPill,
  formatDateTime,
  formatWindow,
} from "@/components/ui";
import { DEMO_SCENARIOS } from "@/lib/demo";
import { formatUsd } from "@/lib/pricing";
import {
  getDashboardMetrics,
  listArtifacts,
  listAudits,
  listEvents,
  listInvoices,
  listRuns,
  listShifts,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const MODULES = [
  {
    id: "A",
    name: "Instant Luxury Quote Drafting",
    trigger: "Quote.Requested · Reservation.Created",
    flow: "PAYLOAD → GUARDRAIL → CLAUDE → GMAIL DRAFT",
    detail:
      "Reconciles the dispatch fare against the pricing engine, composes the confirmation letter in brand voice, and files it as a Gmail draft for the reservations desk.",
    href: "/workflows#module-a",
  },
  {
    id: "B",
    name: "Accounts Receivable Escalation",
    trigger: "Invoice.PastDue > 30 days · cron sweep",
    flow: "RECEIVABLE → CLAUDE → GMAIL DRAFT + #AR-ALERTS",
    detail:
      "Escalates corporate balances with measured authority, respecting the 20+ year relationship. Drafts for the controller and posts a priority card with the draft link.",
    href: "/workflows#module-b",
  },
  {
    id: "C",
    name: "Daily Dispatch Summary & Quality Audit",
    trigger: "Cron 06:00 PT · manual",
    flow: "24H BATCH → CLAUDE AUDIT → SHEETS ROW + #DISPATCH-LOG",
    detail:
      "Grades tone against the five-star standard, flags anomalies, and publishes executive KPIs to Sheets and Slack without a human compiling a report.",
    href: "/workflows#module-c",
  },
] as const;

export default async function OverviewPage() {
  const [metrics, events, runs, artifacts, invoices, shifts, audits] = await Promise.all([
    getDashboardMetrics(),
    listEvents(8),
    listRuns(12),
    listArtifacts(16),
    listInvoices(),
    listShifts(5),
    listAudits(1),
  ]);

  const latestRun = (module: "A" | "B" | "C") => runs.find((run) => run.module === module);
  const drafts = artifacts.filter((artifact) => artifact.kind === "gmail_draft").slice(0, 4);
  const arInvoices = invoices.slice(0, 5);
  const latestAudit = audits[0];
  const scenarioCount = DEMO_SCENARIOS.length;

  const transportLabel =
    metrics.integrations.anthropic || metrics.integrations.google || metrics.integrations.slackAr
      ? "Hybrid live"
      : "Simulated (no credentials)";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Personal Sedan Services · Automation & AI Orchestration"
        title="A quiet operating layer for a very exacting fleet."
        description="An event-driven bridge between Limo Anywhere, Anthropic Claude, Google Workspace and Slack. Every inbound event is validated, priced deterministically, drafted in the house voice, and staged for human approval. Automation never sends on its own."
        actions={
          <>
            <ApiActionButton
              label="Run AR sweep"
              busyLabel="Scanning…"
              endpoint="/api/cron/ar-escalation"
              tone="ghost"
            />
            <ApiActionButton
              label="Run daily audit"
              busyLabel="Auditing…"
              endpoint="/api/cron/daily-audit"
              tone="gold"
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={metrics.integrations.anthropic ? "live" : "unverified"} label={metrics.integrations.anthropic ? "Claude live" : "Claude simulated"} />
        <StatusPill status={metrics.integrations.google ? "live" : "unverified"} label={metrics.integrations.google ? "Gmail live" : "Gmail simulated"} />
        <StatusPill status={metrics.integrations.sheets ? "live" : "unverified"} label={metrics.integrations.sheets ? "Sheets live" : "Sheets simulated"} />
        <StatusPill status={metrics.integrations.slackAr ? "live" : "unverified"} label={metrics.integrations.slackAr ? "Slack armed" : "Slack simulated"} />
        <Badge tone="slate">{transportLabel}</Badge>
        <Badge tone="slate">AR threshold {metrics.thresholds.arEscalationDays}d</Badge>
        <Badge tone="slate">Drafts only · no sends</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <Metric
          label="Events · 24h"
          value={metrics.events24h}
          hint={`${metrics.eventsProcessed} processed · ${metrics.eventsFailed} failed`}
        />
        <Metric
          label="Workflow runs"
          value={metrics.runs24h}
          hint={`${metrics.runsSucceeded} succeeded · ${metrics.runsFailed} failed`}
        />
        <Metric label="Gmail drafts" value={metrics.drafts} hint="Awaiting dispatch approval" accent />
        <Metric
          label="AR escalated"
          value={metrics.escalatedInvoices}
          hint={`${formatUsd(metrics.outstandingBalance)} open exposure`}
        />
        <Metric
          label="Recognized revenue"
          value={formatUsd(metrics.totalRevenue)}
          hint={`${metrics.totalTrips} completed trips`}
        />
        <Metric
          label="Mean AI latency"
          value={`${metrics.avgLatencyMs}ms`}
          hint={`${metrics.tokensUsed.toLocaleString()} tokens accounted`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {MODULES.map((module) => {
              const run = latestRun(module.id);
              return (
                <article key={module.id} className="panel flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="eyebrow">Module {module.id}</p>
                      <h3 className="display mt-1 text-[15px] leading-snug text-ivory">{module.name}</h3>
                    </div>
                    <span className="display text-[26px] leading-none text-gold/40">{module.id}</span>
                  </div>
                  <p className="mono mt-3 text-[9px] leading-relaxed tracking-[0.06em] text-gold-soft">{module.flow}</p>
                  <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">{module.detail}</p>
                  <div className="mt-3 border-t border-hairline pt-2.5">
                    <p className="text-[10px] uppercase tracking-[0.13em] text-[#71777f]">Trigger</p>
                    <p className="mono mt-1 text-[10px] text-[#a9aeb6]">{module.trigger}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2.5">
                    {run ? (
                      <div className="flex flex-col gap-1">
                        <StatusPill status={run.status} />
                        <span className="mono text-[9px] text-[#71777f]">
                          {formatDateTime(run.startedAt)} · {run.mode}
                        </span>
                      </div>
                    ) : (
                      <span className="mono text-[9.5px] text-[#71777f]">No runs recorded</span>
                    )}
                    <Link href={module.href} className="text-[10px] uppercase tracking-[0.14em] text-gold hover:text-ivory">
                      Inspect →
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          <Panel
            title="Inbound event stream"
            eyebrow="Limo Anywhere → orchestrator"
            action={
              <Link href="/events" className="text-[10px] uppercase tracking-[0.14em] text-gold hover:text-ivory">
                Full ledger →
              </Link>
            }
            bodyClassName="p-0"
          >
            {events.length === 0 ? (
              <div className="p-5">
                <Empty
                  title="The stream is quiet"
                  body="Deliver a representative payload from the Demo Delivery panel. The event will be validated, priced, routed and drafted exactly as it would in production."
                />
              </div>
            ) : (
              <div className="overflow-x-auto scroll-thin">
                <table className="table-grid">
                  <thead>
                    <tr>
                      <th>Received</th>
                      <th>Event</th>
                      <th>Subject</th>
                      <th>Signature</th>
                      <th>Status</th>
                      <th>Route</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => {
                      const normalized = (event.normalized ?? {}) as Record<string, unknown>;
                      const subject =
                        (normalized.passengerName as string | undefined) ??
                        (normalized.corporateName as string | undefined) ??
                        (normalized.driverName as string | undefined) ??
                        (normalized.driverId as string | undefined) ??
                        "—";
                      return (
                        <tr key={event.id}>
                          <td className="mono whitespace-nowrap text-[10.5px] text-[#9aa0a8]">
                            {formatWindow(event.receivedAt)}
                          </td>
                          <td>
                            <Link href={`/events/${event.id}`} className="text-ivory hover:text-gold">
                              {event.eventType}
                            </Link>
                            <span className="mono ml-2 text-[9px] uppercase text-[#5d636c]">{event.transport}</span>
                          </td>
                          <td className="text-[#c3c8cf]">{subject}</td>
                          <td>
                            <StatusPill status={event.signatureStatus} />
                          </td>
                          <td>
                            <StatusPill status={event.status} />
                          </td>
                          <td className="mono text-[10px] text-[#8d939b]">{event.routing}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Execution pipeline" eyebrow="Event-driven topology">
              <pre className="code-block text-[9.5px] leading-[1.55]">{`LIMO ANYWHERE  /  ZAPIER WEBHOOK
        │  POST /api/webhooks/limo-anywhere
        │  HMAC-SHA256 · idempotent (source,event_id)
        ▼
 ┌───────────────────┐   reject   ┌──────────────────────┐
 │ INGEST + VALIDATE │ ─────────▶ │ event log · replayable│
 └─────────┬─────────┘            └──────────────────────┘
           │ canonical model
           ├── Quote / Reservation ──▶ [A] ──▶ GMAIL DRAFT
           ├── Invoice > 30d ────────▶ [B] ──▶ DRAFT + #ar-alerts
           └── Shift.Completed ──┐
                                 ▼
   CRON 06:00 PT ──▶ [C] ──▶ SHEETS ROW + #daily-dispatch-log`}</pre>
              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                Cost, latency, retries and token usage are recorded per run. Provider re-deliveries are suppressed by
                the idempotency key, so a Limo Anywhere retry storm cannot duplicate a draft.
              </p>
            </Panel>

            <Panel title="Latest quality audit" eyebrow="Module C" bodyClassName="p-4">
              {latestAudit ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-baseline gap-2">
                      <span className="display text-[30px] leading-none text-gold">
                        {Number.parseFloat(latestAudit.overallScore).toFixed(1)}
                      </span>
                      <span className="text-[11px] text-muted">/ 5 overall</span>
                    </div>
                    <Badge tone="slate">{latestAudit.responseTimeGrade}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(latestAudit.kpis as Record<string, unknown>)
                      .slice(0, 3)
                      .map(([key, value]) => (
                        <div key={key} className="panel-flat px-2 py-2">
                          <p className="text-[8.5px] uppercase tracking-[0.12em] text-[#71777f]">{key.replace(/_/g, " ")}</p>
                          <p className="mono mt-1 text-[12px] text-ivory">
                            {typeof value === "number" && key.includes("revenue") ? formatUsd(value) : String(value)}
                          </p>
                        </div>
                      ))}
                  </div>
                  <p className="text-[11.5px] leading-relaxed text-[#c3c8cf]">{latestAudit.narrative}</p>
                  <p className="mono text-[9px] text-[#5d636c]">Audit {formatDateTime(latestAudit.auditDate)}</p>
                </div>
              ) : (
                <Empty
                  title="No audit on file"
                  body="Run the daily audit to grade tone, response latency and operational anomalies against the five-star standard."
                />
              )}
            </Panel>
          </div>
        </div>

        <div className="space-y-4">
          <Panel title="Demo delivery" eyebrow={`${scenarioCount} provider fixtures`}>
            <EventSimulator
              scenarios={DEMO_SCENARIOS.map(({ key, label, description, eventType, module }) => ({
                key,
                label,
                description,
                eventType,
                module,
              }))}
            />
          </Panel>

          <Panel
            title="Drafts awaiting review"
            eyebrow="Gmail · drafts"
            action={
              <Link href="/outbox" className="text-[10px] uppercase tracking-[0.14em] text-gold hover:text-ivory">
                Outbox →
              </Link>
            }
          >
            {drafts.length === 0 ? (
              <p className="text-[11.5px] leading-relaxed text-muted">
                No drafts yet. Module A and B file drafts here; nothing is sent from this system.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {drafts.map((draft) => (
                  <li key={draft.id} className="border-b border-[#1b1e23] pb-2.5 last:border-b-0 last:pb-0">
                    <Link href={`/outbox?artifact=${draft.id}`} className="group block">
                      <div className="flex items-center justify-between gap-2">
                        <StatusPill status={draft.mode} />
                        <span className="mono text-[9px] text-[#5d636c]">{formatDateTime(draft.createdAt)}</span>
                      </div>
                      <p className="mt-1.5 text-[12px] leading-snug text-ivory group-hover:text-gold">{draft.title}</p>
                      <p className="mono mt-1 text-[9.5px] text-[#71777f]">
                        {String((draft.metadata as Record<string, unknown>)?.recipient ?? "dispatch")}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Receivables exposure" eyebrow="AR monitor" bodyClassName="p-4">
            <ul className="space-y-2.5">
              {arInvoices.map((invoice) => (
                <li key={invoice.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11.5px] text-ivory">{invoice.corporateName}</span>
                    <span className="mono text-[11px] text-gold">{formatUsd(invoice.balanceDue)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className={`h-full rounded-full ${invoice.daysPastDue > 30 ? "bg-warn" : "bg-good/60"}`}
                        style={{ width: `${Math.min(100, (invoice.daysPastDue / 90) * 100)}%` }}
                      />
                    </div>
                    <span className="mono w-14 text-right text-[9px] text-[#8d939b]">{invoice.daysPastDue}d</span>
                    <StatusPill status={invoice.status} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-hairline pt-2.5">
              <p className="mono text-[9.5px] leading-relaxed text-[#5d636c]">
                Sweep escalates &gt; {metrics.thresholds.arEscalationDays} days. Escalated accounts are excluded from
                subsequent sweeps.
              </p>
            </div>
          </Panel>

          <Panel title="Overnight fleet" eyebrow="Completed shifts" bodyClassName="p-4">
            <ul className="space-y-2">
              {shifts.slice(0, 4).map((shift) => (
                <li key={shift.id} className="flex items-center justify-between gap-2 border-b border-[#1b1e23] pb-2 last:border-b-0 last:pb-0">
                  <div>
                    <p className="text-[11.5px] text-ivory">{shift.driverName ?? shift.driverId}</p>
                    <p className="mono text-[9px] text-[#71777f]">{shift.tripsCompleted} trips</p>
                  </div>
                  <div className="text-right">
                    <p className="mono text-[11px] text-ivory">{formatUsd(shift.totalRevenue)}</p>
                    <p className="mono text-[8.5px] uppercase text-[#71777f]">
                      {shift.incidentFlags.length} flag{shift.incidentFlags.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

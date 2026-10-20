import Link from "next/link";
import { ApiActionButton } from "@/components/interactive";
import { Badge, Panel, PageHeader, StatusPill, formatDateTime } from "@/components/ui";
import { formatUsd } from "@/lib/pricing";
import { listAudits, listRuns } from "@/lib/queries";

export const dynamic = "force-dynamic";

const MODULE_SPECS = [
  {
    id: "module-a",
    letter: "A",
    title: "Instant Luxury Quote Drafting",
    trigger: "Quote.Requested · Reservation.Created",
    input:
      "passenger_name, pickup_datetime, pickup_location, dropoff_location, vehicle_type_requested, corporate_account_id, quoted_fare",
    ai: "Claude composes a confirmation letter in the house voice. The itemized guardrail block is injected verbatim; the model is forbidden from computing or rounding a fare. Output is strict JSON validated with Zod.",
    output: "Gmail DRAFT in the dispatch mailbox (never sent) + artifact persisted for review.",
    errors:
      "429/5xx retried with exponential backoff and jitter, honouring retry-after. Non-retryable 4xx fail fast. Schema-invalid output degrades to the deterministic composer and is labelled degraded.",
    flow: `Quote.Requested  ──▶  POST /webhooks/limo-anywhere
                         │
              ┌──────────▼──────────┐
              │ validate (Zod)      │  fail ──▶ 422 + replayable row
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │ pricing guardrail   │  LAS flat / convention / mileage
              │ (deterministic)     │  ±5% fare reconciliation
              └──────────┬──────────┘
                         │  <pricing_guardrail> XML
              ┌──────────▼──────────┐
              │ Claude (JSON only)  │  tone · LAS protocol · rate lines
              └──────────┬──────────┘
                         │  subject + body + risk flags
              ┌──────────▼──────────┐
              │ Gmail drafts.create │  service-account delegation
              └──────────┬──────────┘
                         ▼
              Gmail DRAFT ──▶ reservations.status = quote_drafted`,
    endpoint: "/api/simulate",
  },
  {
    id: "module-b",
    letter: "B",
    title: "Accounts Receivable Corporate Escalation",
    trigger: "Invoice.PastDue > 30 days · cron sweep · manual",
    input: "billing_contact_email, corporate_name, invoice_number, balance_due, days_past_due, due_date",
    ai: "Claude drafts a measured reminder graded courtesy (31–45d), firm (46–75d) or final (76d+). It must honour the 20+ year relationship without flattery and may never threaten legal action.",
    output: "Gmail DRAFT for the controller + high-priority Slack card in #ar-alerts with a deep link to the draft.",
    errors:
      "Policy gate suppresses escalation inside the grace window and records a skipped run. Delivery failures throw, fail the run and leave the invoice open for the next sweep.",
    flow: `Invoice.PastDue ─┐
CRON 06:00 PT ───┴──▶  days_past_due > 30 ?
                              │ yes
                    ┌─────────▼──────────┐
                    │ Claude AR draft    │ escalation_level
                    └─────────┬──────────┘
                              │
              ┌───────────────┼────────────────┐
              ▼                                ▼
     Gmail DRAFT (controller)          Slack #ar-alerts
     artifact + deep link              client · amount · days · link
              │                                │
              └────────────┬───────────────────┘
                           ▼
                 invoices.status = escalated`,
    endpoint: "/api/cron/ar-escalation",
  },
  {
    id: "module-c",
    letter: "C",
    title: "Daily Dispatch Summary & Quality Audit",
    trigger: "Cron 06:00 PT · manual",
    input: "24h batch: email inquiries, phone transcripts, completed shifts, automation telemetry",
    ai: "Multi-task extraction: (1) tone grade against a 5-star standard, (2) response-time grade, (3) critical anomaly flags, (4) KPI summary using computed totals verbatim.",
    output: "Row appended to the `Daily Dispatch Audit` sheet tab + executive summary in #daily-dispatch-log.",
    errors:
      "Batch construction is database-driven, so a missing source degrades to zero counts rather than a crash. Claude failure yields a deterministic audit so the daily log is never empty.",
    flow: `CRON 06:00 PT ──▶ build batch
   ├── communication_logs   (email + phone, 24h)
   ├── shifts               (completed, 24h)
   └── automation telemetry (drafts · AR · failed events)
                     │
            ┌────────▼─────────┐
            │ Claude JSON audit │ tone · response · anomalies · KPIs
            └────────┬─────────┘
                     │
        ┌────────────┴─────────────┐
        ▼                          ▼
Google Sheets append        Slack #daily-dispatch-log
19-column fixed contract    KPIs · score · executive summary`,
    endpoint: "/api/cron/daily-audit",
  },
] as const;

export default async function WorkflowsPage() {
  const [runs, audits] = await Promise.all([listRuns(30), listAudits(6)]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workflow registry"
        title="Three pipelines. One governed concierge."
        description="Each module is an isolated, idempotent runner with its own prompt contract, output schema and delivery adapters. All three share the concierge system prompt, the Claude Project knowledge base and the deterministic pricing guardrail."
      />

      <div className="space-y-4">
        {MODULE_SPECS.map((spec) => {
          const moduleRuns = runs.filter((run) => run.module === spec.letter);
          const latest = moduleRuns[0];
          return (
            <section key={spec.id} id={spec.id} className="panel scroll-mt-6">
              <div className="flex flex-col gap-3 border-b border-hairline px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                <div className="flex items-start gap-3">
                  <span className="display grid h-11 w-11 shrink-0 place-items-center border border-gold-soft/50 bg-gold/10 text-[19px] text-gold">
                    {spec.letter}
                  </span>
                  <div>
                    <p className="eyebrow">Module {spec.letter}</p>
                    <h2 className="display text-[18px] leading-tight text-ivory">{spec.title}</h2>
                    <p className="mono mt-1.5 text-[10px] text-[#8d939b]">{spec.trigger}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="slate">{moduleRuns.length} runs</Badge>
                  {latest ? <StatusPill status={latest.status} /> : <Badge tone="slate">idle</Badge>}
                  <ApiActionButton
                    label={spec.letter === "C" ? "Run audit" : spec.letter === "B" ? "Run sweep" : "Open simulator"}
                    endpoint={spec.endpoint}
                    method={spec.letter === "A" ? "POST" : "POST"}
                    tone={spec.letter === "C" ? "gold" : "ghost"}
                    body={spec.letter === "A" ? { scenario: "quote-sedan" } : undefined}
                  />
                </div>
              </div>

              <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
                <div className="space-y-3">
                  <div>
                    <p className="eyebrow">Input contract</p>
                    <p className="mono mt-1 text-[10.5px] leading-relaxed text-[#c3c8cf]">{spec.input}</p>
                  </div>
                  <div>
                    <p className="eyebrow">AI processing</p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{spec.ai}</p>
                  </div>
                  <div>
                    <p className="eyebrow">Output</p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{spec.output}</p>
                  </div>
                  <div>
                    <p className="eyebrow">Failure handling</p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{spec.errors}</p>
                  </div>
                </div>
                <pre className="code-block scroll-thin text-[9.5px] leading-[1.6]">{spec.flow}</pre>
              </div>

              {moduleRuns.length > 0 ? (
                <div className="border-t border-hairline">
                  <div className="overflow-x-auto scroll-thin">
                    <table className="table-grid">
                      <thead>
                        <tr>
                          <th>Started</th>
                          <th>Trigger</th>
                          <th>Status</th>
                          <th>Mode</th>
                          <th>Latency</th>
                          <th>Retries</th>
                          <th>Summary</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {moduleRuns.slice(0, 6).map((run) => (
                          <tr key={run.id}>
                            <td className="mono whitespace-nowrap text-[10px] text-[#9aa0a8]">
                              {formatDateTime(run.startedAt)}
                            </td>
                            <td className="mono text-[10px] uppercase text-[#9aa0a8]">{run.trigger}</td>
                            <td>
                              <StatusPill status={run.status} />
                            </td>
                            <td className="mono text-[10px] uppercase text-[#9aa0a8]">{run.mode}</td>
                            <td className="mono text-[10px] text-[#9aa0a8]">{run.latencyMs}ms</td>
                            <td className="mono text-[10px] text-[#9aa0a8]">{run.retries}</td>
                            <td className="max-w-[420px] text-[11px] leading-relaxed text-[#c3c8cf]">
                              {run.summary ?? "—"}
                            </td>
                            <td>
                              <Link
                                href={`/workflows/${run.id}`}
                                className="text-[10px] uppercase tracking-[0.13em] text-gold hover:text-ivory"
                              >
                                Trace →
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <Panel title="Quality audit history" eyebrow="Module C output" bodyClassName="p-0">
        {audits.length === 0 ? (
          <p className="p-4 text-[12px] text-muted">
            No audits recorded. Run the daily audit to grade the trailing 24 hours.
          </p>
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="table-grid">
              <thead>
                <tr>
                  <th>Audit date</th>
                  <th>Overall</th>
                  <th>Tone</th>
                  <th>Response</th>
                  <th>Revenue</th>
                  <th>Trips</th>
                  <th>Narrative</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((audit) => {
                  const kpis = audit.kpis as Record<string, unknown>;
                  const anomalies = audit.anomalies as unknown[];
                  return (
                    <tr key={audit.id}>
                      <td className="mono whitespace-nowrap text-[10px] text-[#9aa0a8]">
                        {formatDateTime(audit.auditDate)}
                      </td>
                      <td className="mono text-[12px] text-gold">{Number.parseFloat(audit.overallScore).toFixed(1)}</td>
                      <td className="mono text-[11px] text-ivory">{Number.parseFloat(audit.toneScore).toFixed(1)} / 5</td>
                      <td className="text-[11px] text-[#c3c8cf]">{audit.responseTimeGrade}</td>
                      <td className="mono text-[11px] text-ivory">
                        {formatUsd(Number(kpis.revenue_estimate ?? 0))}
                      </td>
                      <td className="mono text-[11px] text-ivory">{String(kpis.total_trips ?? 0)}</td>
                      <td className="max-w-[440px] text-[11px] leading-relaxed text-muted">
                        {audit.narrative}
                        <span className="mono mt-1 block text-[9px] uppercase text-[#71777f]">
                          {anomalies.length} anomalies
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

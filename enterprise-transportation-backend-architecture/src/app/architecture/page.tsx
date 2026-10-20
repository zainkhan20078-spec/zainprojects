import { CopyButton } from "@/components/interactive";
import { Badge, Panel, PageHeader } from "@/components/ui";
import { ANTHROPIC_CONFIG, BRAND, WORKFLOW_CONFIG } from "@/lib/config";

export const dynamic = "force-dynamic";

const TOPOLOGY = `                         ┌────────────────────────────────────────────┐
                         │            LIMO ANYWHERE (DISPATCH)        │
                         │  Reservation · Quote · Invoice · Shift     │
                         └───────────────┬────────────────────────────┘
                                         │ native webhook  |  Zapier wrapper
                                         ▼
    ╔════════════════════════════════════════════════════════════════════════╗
    ║  NODE.JS / TYPESCRIPT ORCHESTRATION LAYER (Next.js route handlers)     ║
    ║                                                                        ║
    ║  POST /api/webhooks/limo-anywhere                                      ║
    ║    ├─ HMAC-SHA256 verify          (constant-time, raw body)            ║
    ║    ├─ idempotency (source,event_id) unique index                       ║
    ║    ├─ zod canonical validation    → rejected rows persisted + replay   ║
    ║    └─ routing                                                          ║
    ║          ├── Quote.Requested / Reservation.Created ─▶ MODULE A         ║
    ║          ├── Invoice.PastDue (>30d) ────────────────▶ MODULE B         ║
    ║          └── Shift.Completed ───────────────────────▶ shift ledger     ║
    ║                                                                        ║
    ║  CRON ─▶ /api/cron/ar-escalation ──▶ MODULE B sweep                    ║
    ║  CRON ─▶ /api/cron/daily-audit   ──▶ MODULE C batch audit              ║
    ╚════════════════════════════════════════════════════════════════════════╝
             │                    │                     │                  │
             ▼                    ▼                     ▼                  ▼
   ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐  ┌──────────────┐
   │ ANTHROPIC CLAUDE│  │ GOOGLE WORKSPACE │  │     SLACK      │  │  POSTGRES    │
   │ Sonnet · JSON   │  │ Gmail DRAFTS     │  │ #ar-alerts     │  │ events·runs  │
   │ retry + timeout │  │ Sheets audit row │  │ #dispatch-log  │  │ artifacts    │
   └─────────────────┘  └──────────────────┘  └────────────────┘  └──────────────┘
             │                    │                     │
             └────────── every artefact persisted with run id, mode ──────────┘`;

const RETRY_FLOW = `attempt 0 ──▶ messages.create (timeout ${ANTHROPIC_CONFIG.timeoutMs} ms)
   │
   ├── 200 + valid JSON ──▶ mode=live ──▶ schema.parse ──▶ deliver
   │
   ├── 429 / 408 / 409 / 5xx / network ──▶ backoff
   │        delay = min(base × 2^n, max) × jitter
   │        retry-after honoured when present
   │        └── attempts exhausted ──▶ mode=degraded ──▶ deterministic composer
   │
   └── 400 / 401 / 403 / 404 ──▶ fail fast (no wasted retries) ──▶ run.error`;

const ENDPOINTS = [
  {
    method: "POST",
    path: "/api/webhooks/limo-anywhere",
    purpose: "Limo Anywhere / Zapier consumer. HMAC verified, idempotent, routed to Module A/B or the shift ledger.",
    auth: "HMAC signature",
  },
  {
    method: "GET",
    path: "/api/webhooks/limo-anywhere",
    purpose: "Self-describing endpoint contract: supported events, verification mode, routing table.",
    auth: "Public",
  },
  {
    method: "POST",
    path: "/api/simulate",
    purpose: "Runs a representative provider fixture through the production pipeline.",
    auth: "Internal",
  },
  {
    method: "POST",
    path: "/api/events/:id/replay",
    purpose: "Replays a persisted event under a new event id for audit-safe recovery.",
    auth: "Internal",
  },
  {
    method: "GET|POST",
    path: "/api/cron/ar-escalation",
    purpose: "AR sweep across receivables past the escalation threshold (Module B).",
    auth: "Bearer CRON_SECRET",
  },
  {
    method: "GET|POST",
    path: "/api/cron/daily-audit",
    purpose: "Builds the 24h batch and executes the dispatch audit (Module C).",
    auth: "Bearer CRON_SECRET",
  },
  {
    method: "POST",
    path: "/api/invoices/:id/escalate",
    purpose: "Controller-initiated escalation for a single receivable.",
    auth: "Internal",
  },
  {
    method: "GET|PUT",
    path: "/api/knowledge",
    purpose: "Read or version Claude Project XML artifacts.",
    auth: "Internal",
  },
  {
    method: "GET|POST",
    path: "/api/quote",
    purpose: "Deterministic pricing guardrail — the same engine injected into prompts.",
    auth: "Internal",
  },
  {
    method: "GET",
    path: "/api/events · /api/runs · /api/artifacts · /api/metrics",
    purpose: "Read models for the console and BI ingestion.",
    auth: "Internal",
  },
  {
    method: "GET",
    path: "/api/health",
    purpose: "Postgres liveness plus integration readiness flags.",
    auth: "Public",
  },
];

const ENV_VARS = [
  { key: "DATABASE_URL", required: "yes", purpose: "Postgres connection used by Drizzle." },
  { key: "ANTHROPIC_API_KEY", required: "recommended", purpose: "Claude API key. Absent → deterministic composer (simulated)." },
  { key: "ANTHROPIC_MODEL", required: "no", purpose: `Default ${ANTHROPIC_CONFIG.model}.` },
  { key: "CLAUDE_TIMEOUT_MS / CLAUDE_MAX_RETRIES", required: "no", purpose: "Per-request timeout and retry ceiling." },
  { key: "CLAUDE_BASE_BACKOFF_MS / CLAUDE_MAX_BACKOFF_MS", required: "no", purpose: "Exponential backoff bounds." },
  { key: "LIMO_ANYWHERE_WEBHOOK_SECRET", required: "production", purpose: "HMAC-SHA256 signing secret. Unset = dev mode (unverified)." },
  { key: "LIMO_ANYWHERE_API_KEY", required: "optional", purpose: "Reserved for outbound Limo Anywhere API lookups." },
  { key: "GOOGLE_SERVICE_ACCOUNT_EMAIL", required: "for Gmail/Sheets", purpose: "Service account with domain-wide delegation." },
  { key: "GOOGLE_PRIVATE_KEY", required: "for Gmail/Sheets", purpose: "Service account private key (\\n escaped)." },
  { key: "GOOGLE_IMPERSONATED_USER", required: "for Gmail/Sheets", purpose: "Workspace user to impersonate; drafts land in their mailbox." },
  { key: "GOOGLE_SHEET_ID / GOOGLE_SHEETS_AUDIT_TAB", required: "for Module C", purpose: "Audit workbook and tab name." },
  { key: "SLACK_AR_WEBHOOK_URL / SLACK_DISPATCH_WEBHOOK_URL", required: "for Slack", purpose: "Incoming webhooks for the two channels." },
  { key: "SLACK_AR_CHANNEL / SLACK_DISPATCH_CHANNEL", required: "no", purpose: "Display + telemetry channel labels." },
  { key: "RESERVATIONS_FROM_EMAIL / DISPATCH_DRAFT_TO", required: "recommended", purpose: "Draft author and fallback recipient." },
  { key: "AR_ESCALATION_DAYS", required: "no", purpose: `Policy gate, default ${WORKFLOW_CONFIG.arEscalationDays}.` },
  { key: "AUDIT_LOOKBACK_HOURS", required: "no", purpose: "Module C batch window, default 24." },
  { key: "CRON_SECRET", required: "production", purpose: "Bearer secret for scheduled endpoints." },
  { key: "PUBLIC_APP_URL", required: "recommended", purpose: "Absolute console links used in Slack buttons." },
];

const XML_SCHEMA = `<project_knowledge>
  <fleet_manifest>
    <staging_rules>15-minute staging · detailed cabin · assignment is final</staging_rules>
    <vehicle class="sedan" code="SEDAN" passengers="3" baggage="3" />
    <vehicle class="vip_suv" code="VIP_SUV" passengers="6" baggage="6" />
    <vehicle class="executive_sprinter" code="SPRINTER" passengers="12" baggage="12" />
    <substitution_policy>Upgrades at no charge · downgrades require dispatch approval</substitution_policy>
  </fleet_manifest>

  <las_airport_procedures airport="Harry Reid International (LAS)">
    <terminal name="Terminal 1" airlines="Southwest · Spirit · Allegiant · Frontier" baggage_claim="Level 0" />
    <terminal name="Terminal 3" airlines="Delta · American · United · international" baggage_claim="Level 0" />
    <meet_and_greet>Corporate, VIP SUV, Sprinter, international, 3+ bags → baggage claim tablet sign
      <timing>10 min after wheels-down · 60 complimentary minutes</timing>
    </meet_and_greet>
    <curbside_pickup>Sedan carry-on only or explicit request · 5-minute curb hold · limo lot fallback</curbside_pickup>
  </las_airport_procedures>

  <corporate_pricing_rules currency="USD">
    <model name="airport_flat">LAS transfers · flat by vehicle class · fee + fuel + 20% gratuity</model>
    <model name="hourly_disposal">3-hour minimum · 30-minute increments</model>
    <model name="mileage">Non-airport point-to-point · per mile · 10-mile minimum</model>
    <model name="convention_flat">Published event windows only · otherwise mileage</model>
    <constraint>Itemize base · airport fee · fuel · gratuity · total. Never round.</constraint>
    <constraint>±5% dispatch fare tolerance → otherwise "pending dispatch review".</constraint>
    <constraint>No discounts, hold fees or no-show fees from AI. Account executive only.</constraint>
  </corporate_pricing_rules>
</project_knowledge>`;

const CURL_EXAMPLE = `# Native Limo Anywhere payload
SECRET="your-limo-anywhere-webhook-secret"
BODY='{"event_type":"Quote.Requested","event_id":"evt_1042","payload":{
  "passenger_name":"Mr. Marcus Whitcombe",
  "passenger_email":"m.whitcombe@meridiancapital.example",
  "pickup_datetime":"2026-03-12T18:40:00-07:00",
  "pickup_location":"Harry Reid International Airport, Terminal 3",
  "dropoff_location":"Wynn Las Vegas",
  "vehicle_type_requested":"Sedan",
  "corporate_account_id":"CORP-1041",
  "quoted_fare":135.60,
  "flight_number":"DL1042"
}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

curl -X POST https://ops.personalsedanservices.com/api/webhooks/limo-anywhere \\
  -H "Content-Type: application/json" \\
  -H "x-limo-anywhere-signature: $SIG" \\
  --data "$BODY"

# Cron (Vercel / cron-job.org / Cloud Scheduler)
curl -X POST https://ops.personalsedanservices.com/api/cron/daily-audit \\
  -H "Authorization: Bearer $CRON_SECRET"`;

const CRON_CONFIG = `{
  "crons": [
    { "path": "/api/cron/ar-escalation", "schedule": "0 6 * * 1-5" },
    { "path": "/api/cron/daily-audit", "schedule": "0 6 * * *" }
  ]
}`;

export default function ArchitecturePage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Enterprise architecture"
        title="Hybrid automation, governed by humans and deterministic pricing."
        description="Limo Anywhere remains the system of record. This layer owns validation, reconciliation, composition and delivery. Claude writes in the house voice; it never prices a trip, never sends a guest message, and never invents an operational fact."
        actions={
          <>
            <a href="/api/webhooks/limo-anywhere" className="btn btn-ghost" target="_blank" rel="noreferrer">
              Endpoint contract
            </a>
            <a href="/api/health" className="btn btn-ghost" target="_blank" rel="noreferrer">
              Health probe
            </a>
          </>
        }
      />

      <Panel
        title="System topology"
        eyebrow={BRAND.name}
        action={<CopyButton value={TOPOLOGY} label="Copy diagram" />}
        bodyClassName="p-3"
      >
        <pre className="code-block scroll-thin text-[9px] leading-[1.5]">{TOPOLOGY}</pre>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel title="Claude call discipline" eyebrow="Timeouts · backoff · degradation" bodyClassName="p-3">
          <pre className="code-block scroll-thin text-[9.5px] leading-[1.6]">{RETRY_FLOW}</pre>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              { label: "Model", value: ANTHROPIC_CONFIG.model },
              { label: "Timeout", value: `${ANTHROPIC_CONFIG.timeoutMs} ms` },
              { label: "Max retries", value: String(ANTHROPIC_CONFIG.maxRetries) },
              { label: "Backoff", value: `${ANTHROPIC_CONFIG.baseBackoffMs}→${ANTHROPIC_CONFIG.maxBackoffMs} ms` },
            ].map((item) => (
              <div key={item.label} className="panel-flat px-2.5 py-2">
                <p className="text-[8.5px] uppercase tracking-[0.12em] text-[#71777f]">{item.label}</p>
                <p className="mono mt-1 text-[11px] text-ivory">{item.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Every run persists mode (live / degraded / simulated), retries, latency and token counts. A degraded run
            still produces a reviewable draft, so a Claude outage never stops dispatch.
          </p>
        </Panel>

        <Panel title="Endpoint surface" eyebrow="Route handlers" bodyClassName="p-0">
          <div className="max-h-[420px] overflow-y-auto scroll-thin">
            <table className="table-grid">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Path</th>
                  <th>Auth</th>
                </tr>
              </thead>
              <tbody>
                {ENDPOINTS.map((endpoint) => (
                  <tr key={endpoint.path}>
                    <td className="mono whitespace-nowrap text-[9.5px] uppercase text-gold">{endpoint.method}</td>
                    <td>
                      <p className="mono text-[10px] text-ivory">{endpoint.path}</p>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-[#8d939b]">{endpoint.purpose}</p>
                    </td>
                    <td className="mono whitespace-nowrap text-[9px] text-[#71777f]">{endpoint.auth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel title="Environment configuration" eyebrow=".env.example">
        <div className="overflow-x-auto scroll-thin">
          <table className="table-grid">
            <thead>
              <tr>
                <th>Variable</th>
                <th>Required</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              {ENV_VARS.map((variable) => (
                <tr key={variable.key}>
                  <td className="mono whitespace-nowrap text-[10px] text-gold">{variable.key}</td>
                  <td className="whitespace-nowrap text-[10.5px] text-[#9aa0a8]">{variable.required}</td>
                  <td className="text-[11px] leading-relaxed text-[#c3c8cf]">{variable.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          A full template ships in <span className="mono text-gold">.env.example</span>. The application boots and
          demonstrates every pipeline without credentials, labelling all delivery as simulated.
        </p>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Claude Project schema"
          eyebrow="XML knowledge contract"
          action={<CopyButton value={XML_SCHEMA} label="Copy XML" />}
          bodyClassName="p-3"
        >
          <pre className="code-block scroll-thin text-[9px] leading-[1.55]">{XML_SCHEMA}</pre>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Live versions are editable on the Knowledge Base page. The same tags are consumed by the runtime system
            prompt and can be uploaded to a Claude Project as knowledge artifacts.
          </p>
        </Panel>

        <div className="space-y-4">
          <Panel
            title="Signature verification"
            eyebrow="cURL reference"
            action={<CopyButton value={CURL_EXAMPLE} label="Copy" />}
            bodyClassName="p-3"
          >
            <pre className="code-block scroll-thin text-[9px] leading-[1.55]">{CURL_EXAMPLE}</pre>
          </Panel>

          <Panel
            title="Scheduled execution"
            eyebrow="Cron contract"
            action={<CopyButton value={CRON_CONFIG} label="Copy" />}
            bodyClassName="p-3"
          >
            <pre className="code-block scroll-thin text-[9.5px]">{CRON_CONFIG}</pre>
            <ul className="mt-3 space-y-1.5 text-[11px] leading-relaxed text-muted">
              <li>· AR sweep 06:00 PT on weekdays; idempotent and escalates only unescalated balances.</li>
              <li>· Daily audit at 06:00 PT; the batch window is the trailing 24 hours.</li>
              <li>· Both accept GET for Vercel Cron and POST for Cloud Scheduler or cron-job.org.</li>
            </ul>
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Governance" eyebrow="Non-negotiables">
          <ul className="space-y-2 text-[11.5px] leading-relaxed text-muted">
            <li>· Gmail scope is <span className="mono text-gold">gmail.compose</span> — the codebase has no send call.</li>
            <li>· Guests are never told that drafting was automated.</li>
            <li>· Pricing arithmetic never crosses the model boundary.</li>
            <li>· Signatures are verified in constant time against the raw body.</li>
            <li>· Runs, tokens and retries are auditable for cost and SLA review.</li>
          </ul>
        </Panel>
        <Panel title="Reliability" eyebrow="Failure modes">
          <ul className="space-y-2 text-[11.5px] leading-relaxed text-muted">
            <li>· Duplicate deliveries: unique (source, event_id) index, HTTP 200 to stop provider retries.</li>
            <li>· Malformed payloads: persisted, marked failed, replayable from the console.</li>
            <li>· Claude outage: deterministic composer, run labelled degraded.</li>
            <li>· Google outage: run fails loudly; invoice stays open for the next sweep.</li>
            <li>· Empty pricing table: breakdown flagged, draft states dispatch will confirm the fare.</li>
          </ul>
        </Panel>
        <Panel title="Scaling path" eyebrow="Next increments">
          <ul className="space-y-2 text-[11.5px] leading-relaxed text-muted">
            <li>· Move inline webhook processing to a durable queue (QStash / SQS) with the same runner contracts.</li>
            <li>· Add Limo Anywhere outbound reconciliation for fare disputes.</li>
            <li>· Feed the audit to a warehouse for trended tone and latency scoring.</li>
            <li>· Add per-account tone profiles to the knowledge base without touching code.</li>
          </ul>
        </Panel>
      </div>

      <Panel title="Data model" eyebrow="Postgres · Drizzle">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["webhook_events", "Raw payload, canonical model, status, routing, idempotency key."],
            ["reservations", "Quote intake with dispatch fare, guardrail fare and full breakdown JSON."],
            ["invoices", "Receivable state, escalation status, days past due."],
            ["shifts / communication_logs", "Module C inputs: complete shifts, inquiries, phone transcripts."],
            ["workflow_runs", "Mode, model, latency, tokens, retries, summary, validated output."],
            ["artifacts", "Gmail drafts, Slack messages, Sheets rows with references and metadata."],
            ["pricing_rules", "Vehicle-class guardrails feeding every prompt."],
            ["knowledge_documents", "Versioned Claude Project XML artifacts."],
            ["dispatch_audits", "Structured Module C output: scores, KPIs, anomalies, narrative."],
          ].map(([table, purpose]) => (
            <div key={table} className="panel-flat p-3">
              <p className="mono text-[10px] text-gold">{table}</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{purpose}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="gold">TypeScript · strict</Badge>
          <Badge tone="slate">Zod contracts</Badge>
          <Badge tone="slate">Drizzle ORM</Badge>
          <Badge tone="slate">Next.js route handlers</Badge>
          <Badge tone="slate">No background daemon required</Badge>
        </div>
      </Panel>
    </div>
  );
}

# Personal Sedan Services — Automation & AI Orchestration

Enterprise event-driven bridge between **Limo Anywhere**, **Anthropic Claude**, **Google Workspace** and **Slack** for a Las Vegas chauffeured transportation operator (est. 2000).

Limo Anywhere remains the system of record. This layer owns validation, deterministic pricing reconciliation, AI composition, delivery and audit. **Automation drafts; humans send.**

---

## 1. Topology

```
                         ┌────────────────────────────────────────────┐
                         │            LIMO ANYWHERE (DISPATCH)        │
                         │  Reservation · Quote · Invoice · Shift     │
                         └───────────────┬────────────────────────────┘
                                         │ native webhook | Zapier wrapper
                                         ▼
    ╔════════════════════════════════════════════════════════════════════════╗
    ║  NODE.JS / TYPESCRIPT ORCHESTRATION (Next.js App Router route handlers)║
    ║                                                                        ║
    ║  POST /api/webhooks/limo-anywhere                                      ║
    ║    ├─ HMAC-SHA256 verify (constant-time, raw body)                     ║
    ║    ├─ idempotency (source,event_id) unique index                       ║
    ║    ├─ zod canonical validation → failed rows persisted + replayable    ║
    ║    └─ routing                                                          ║
    ║          ├── Quote.Requested / Reservation.Created ─▶ MODULE A         ║
    ║          ├── Invoice.PastDue (>30d) ────────────────▶ MODULE B         ║
    ║          └── Shift.Completed ───────────────────────▶ shift ledger     ║
    ║                                                                        ║
    ║  /api/cron/ar-escalation ─▶ MODULE B sweep                             ║
    ║  /api/cron/daily-audit   ─▶ MODULE C batch audit                       ║
    ╚════════════════════════════════════════════════════════════════════════╝
             │                    │                     │                  │
             ▼                    ▼                     ▼                  ▼
   ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐  ┌──────────────┐
   │ ANTHROPIC CLAUDE│  │ GOOGLE WORKSPACE │  │     SLACK      │  │  POSTGRES    │
   │ Sonnet · JSON   │  │ Gmail DRAFTS     │  │ #ar-alerts     │  │ events·runs  │
   │ retry + timeout │  │ Sheets audit row │  │ #dispatch-log  │  │ artifacts    │
   └─────────────────┘  └──────────────────┘  └────────────────┘  └──────────────┘
```

### Module pipelines

**A — Instant Luxury Quote Drafting**

```
Quote.Requested ─▶ validate ─▶ pricing guardrail ─▶ <pricing_guardrail> XML
       ─▶ Claude (strict JSON) ─▶ Gmail drafts.create ─▶ dispatch review
```

**B — AR Corporate Escalation**

```
Invoice.PastDue ─┐
CRON 06:00 PT ───┴─▶ days_past_due > 30 ? ─▶ Claude AR draft
       ├─▶ Gmail DRAFT (controller)
       └─▶ Slack #ar-alerts (client · amount · days · draft link)
       ─▶ invoices.status = escalated
```

**C — Daily Dispatch Summary & Quality Audit**

```
24h batch (inquiries + transcripts + shifts + automation telemetry)
       ─▶ Claude multi-task audit (tone · latency · anomalies · KPIs)
       ├─▶ Google Sheets row (19-column contract)
       └─▶ Slack #daily-dispatch-log executive summary
```

---

## 2. Event contracts

| Event | Extracted fields | Route |
| --- | --- | --- |
| `Reservation.Created` / `Quote.Requested` | `passenger_name`, `pickup_datetime`, `pickup_location`, `dropoff_location`, `vehicle_type_requested`, `corporate_account_id`, `quoted_fare` | Module A |
| `Invoice.PastDue` | `billing_contact_email`, `corporate_name`, `invoice_number`, `balance_due`, `days_past_due` | AR monitor → Module B |
| `Shift.Completed` | `driver_id`, `trips_completed`, `total_revenue`, `incident_flags` | Shift ledger → Module C |

Both transports are accepted:

```json
{ "event_type": "Quote.Requested", "event_id": "evt_1042", "payload": { "...": "..." } }
```

```json
{ "event": "quote_requested", "id": "zap_123", "zap_meta": { "id": "zap-1" }, "data": { "...": "..." } }
```

Native Limo Anywhere PascalCase keys (`PassengerName`, `PickupAddress`, `QuotedFare`, …) are resolved by a normalized-key lookup.

Verification and failure semantics:

| Condition | HTTP | Behaviour |
| --- | --- | --- |
| Bad HMAC | 401 | Rejected before persistence |
| Malformed JSON / envelope | 400 | Rejected with field-level issues |
| Unsupported event type | 422 | Rejected with supported list |
| Validation failure after persistence | 422 | Row stored `failed`, replayable |
| Duplicate `(source,event_id)` | 200 | Original row returned, no side effects |
| Accepted and processed | 202 | Contains route + workflow summary |

---

## 3. Claude orchestration

* Model: `ANTHROPIC_MODEL` (default `claude-sonnet-4-5`).
* Strict per-request timeout (`CLAUDE_TIMEOUT_MS`, default 45s), SDK retries disabled in favour of owned backoff.
* Exponential backoff with full jitter on `408 / 409 / 429 / 5xx / 529 / network`; `retry-after` honoured; non-retryable 4xx fail fast.
* Every call requests strict JSON and is validated with Zod before it can become a draft. Invalid output degrades to a deterministic composer and the run is labelled `degraded`.
* Token usage, retries and latency are recorded per run.
* System prompt = Elite Virtual Concierge role + brand voice contract + Claude Project XML + per-request `<pricing_guardrail>`.

Pricing guardrails are computed **outside** the model (`src/lib/pricing.ts`): airport flat, convention flat, hourly minimum, mileage with 10-mile floor, airport fee, fuel surcharge, 20% gratuity. A dispatch fare variance beyond ±5% downgrades the draft to “pending dispatch review”.

### Claude Project XML schema

`<fleet_manifest>` · `<las_airport_procedures>` · `<corporate_pricing_rules>` (plus `<brand_identity>`) live in Postgres, are editable in the console, and are injected into every prompt. See the Knowledge Base page for the full text and `/src/lib/seed-data.ts` for defaults.

---

## 4. Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/webhooks/limo-anywhere` | Limo Anywhere / Zapier consumer |
| GET | `/api/webhooks/limo-anywhere` | Self-describing contract |
| POST | `/api/simulate` | Run a provider fixture through the real pipeline |
| POST | `/api/events/:id/replay` | Replay a persisted event under a new id |
| GET/POST | `/api/cron/ar-escalation` | Module B sweep (`Bearer CRON_SECRET`) |
| GET/POST | `/api/cron/daily-audit` | Module C audit (`Bearer CRON_SECRET`) |
| POST | `/api/invoices/:id/escalate` | Manual controller escalation |
| GET/PUT | `/api/knowledge` | Read / version Claude Project XML |
| GET/POST | `/api/quote` | Deterministic pricing engine |
| GET | `/api/events`, `/api/runs`, `/api/artifacts`, `/api/metrics` | Read models |
| GET | `/api/health` | Postgres + integration readiness |

---

## 5. Local setup

```bash
npm install
cp .env.example .env          # DATABASE_URL is enough for the simulated stack
npx drizzle-kit push          # create the schema
npm run dev                   # http://localhost:3000
```

Open the console, then use **Demo delivery** to push a `Quote.Requested`, a 47-day-past-due invoice, a completed shift, or a Zapier-wrapped quote. Each fixture runs the same code path as production and appears in the ledger, workflow registry and outbox.

No credentials? Every delivery is recorded as `simulated` — drafts render in the Outbox, Slack cards and Sheets rows are persisted with full metadata.

---

## 6. Scheduled execution

```json
{
  "crons": [
    { "path": "/api/cron/ar-escalation", "schedule": "0 6 * * 1-5" },
    { "path": "/api/cron/daily-audit", "schedule": "0 6 * * *" }
  ]
}
```

Both endpoints accept `GET` (Vercel Cron) and `POST` (Cloud Scheduler / cron-job.org), guarded by `Authorization: Bearer $CRON_SECRET`.

---

## 7. Google Workspace setup

1. Create a GCP service account and enable the Gmail API and Google Sheets API.
2. Enable domain-wide delegation and authorize scopes `gmail.compose` and `spreadsheets`.
3. Set `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_IMPERSONATED_USER`.
4. Create the audit workbook, share it with the impersonated user (or the service account), and set `GOOGLE_SHEET_ID` + tab.
5. Create Slack incoming webhooks for `#ar-alerts` and `#daily-dispatch-log`.

The Gmail adapter has no send path; the only compose call is `users.drafts.create`.

---

## 8. File map

```
src/db/schema.ts                 Drizzle schema (events, reservations, invoices, shifts,
                                 runs, artifacts, pricing, knowledge, audits, comms)
src/lib/events.ts                Limo Anywhere event schemas + envelope normalization
src/lib/pricing.ts               Deterministic pricing guardrail engine
src/lib/pipeline.ts              HMAC verify → idempotency → validate → route
src/lib/claude/client.ts         Anthropic client: timeout, backoff, degradation, accounting
src/lib/claude/prompts.ts        System prompt + JSON contracts per module
src/lib/claude/fallbacks.ts      Deterministic composers (simulated / degraded mode)
src/lib/integrations/google.ts   Gmail drafts + Sheets append (service account)
src/lib/integrations/slack.ts    Slack webhook delivery + Block Kit cards
src/lib/workflows/module-a.ts    Instant luxury quote drafting
src/lib/workflows/module-b.ts    AR escalation + invoice upsert
src/lib/workflows/module-c.ts    24h batch audit → Sheets + Slack
src/lib/bootstrap.ts             Idempotent seed of pricing, knowledge, 24h snapshot
src/app/api/*                    Route handlers
src/app/*                        Operations console (overview, operations, events,
                                 workflows, outbox, knowledge, architecture)
```

---

## 9. Governance

* Drafts only — no automated guest sends; Gmail scope is `gmail.compose`.
* Pricing arithmetic never crosses the model boundary.
* Guests are never told drafting was automated.
* Constant-time HMAC verification against the raw request body.
* Idempotency prevents provider retry storms from duplicating drafts.
* Every run records mode, model, tokens, retries, latency and the validated output.


The example DATABASE_URL is a safe local placeholder. Replace it with a reachable PostgreSQL URL before running Drizzle commands.

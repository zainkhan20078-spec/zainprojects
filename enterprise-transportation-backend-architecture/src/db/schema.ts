/**
 * Personal Sedan Services — Automation & AI Orchestration schema.
 *
 * Every inbound Limo Anywhere event is persisted before it is routed, which
 * gives the orchestration layer replayability, idempotency and an audit trail.
 * Downstream artefacts (Gmail drafts, Slack posts, Sheets rows) are persisted in
 * `artifacts` so operators can inspect exactly what the AI produced.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Raw + normalized webhook events (idempotent per source/event id). */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    source: text("source").notNull().default("limo-anywhere"),
    transport: text("transport").notNull().default("native"), // native | zapier
    signatureStatus: text("signature_status").notNull().default("unverified"),
    status: text("status").notNull().default("received"), // received | processed | failed | skipped | duplicate
    routing: text("routing").notNull().default("none"), // module-a | module-b | module-c | shift-ingest | none
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    normalized: jsonb("normalized").$type<Record<string, unknown>>(),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("webhook_events_source_event_id_idx").on(table.source, table.eventId),
    index("webhook_events_received_at_idx").on(table.receivedAt),
    index("webhook_events_type_idx").on(table.eventType),
  ],
);

/** Reservations and quote requests sourced from Limo Anywhere. */
export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalId: text("external_id"),
    eventId: text("event_id").notNull(),
    passengerName: text("passenger_name").notNull(),
    passengerEmail: text("passenger_email"),
    passengerPhone: text("passenger_phone"),
    pickupDatetime: timestamp("pickup_datetime", { withTimezone: true }).notNull(),
    pickupLocation: text("pickup_location").notNull(),
    dropoffLocation: text("dropoff_location").notNull(),
    vehicleTypeRequested: text("vehicle_type_requested").notNull(),
    corporateAccountId: text("corporate_account_id"),
    corporateName: text("corporate_name"),
    quotedFare: numeric("quoted_fare", { precision: 10, scale: 2 }).notNull(),
    calculatedFare: numeric("calculated_fare", { precision: 10, scale: 2 }).notNull(),
    quoteBreakdown: jsonb("quote_breakdown").$type<Record<string, unknown>>().notNull(),
    passengers: integer("passengers").notNull().default(1),
    flightNumber: text("flight_number"),
    tripType: text("trip_type").notNull().default("transfer"),
    status: text("status").notNull().default("quoted"), // quoted | quote_drafted | needs_review
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("reservations_created_at_idx").on(table.createdAt)],
);

/** Corporate receivable balances. Escalated to Module B past 30 days. */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalId: text("external_id").notNull(),
    invoiceNumber: text("invoice_number").notNull(),
    corporateName: text("corporate_name").notNull(),
    billingContactEmail: text("billing_contact_email").notNull(),
    balanceDue: numeric("balance_due", { precision: 10, scale: 2 }).notNull(),
    daysPastDue: integer("days_past_due").notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    status: text("status").notNull().default("tracked"), // tracked | escalated | resolved
    lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("invoices_external_id_idx").on(table.externalId)],
);

/** Completed driver shifts used by Module C quality audits. */
export const shifts = pgTable(
  "shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalId: text("external_id").notNull(),
    driverId: text("driver_id").notNull(),
    driverName: text("driver_name"),
    tripsCompleted: integer("trips_completed").notNull(),
    totalRevenue: numeric("total_revenue", { precision: 10, scale: 2 }).notNull(),
    incidentFlags: jsonb("incident_flags").$type<string[]>().notNull().default([]),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("shifts_external_id_idx").on(table.externalId)],
);

/** Inbound inquiries + transcripts rolled into the Module C daily batch. */
export const communicationLogs = pgTable("communication_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  channel: text("channel").notNull(), // email | phone
  customerName: text("customer_name").notNull(),
  subject: text("subject").notNull(),
  content: text("content").notNull(),
  responseTimeSeconds: integer("response_time_seconds").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One row per workflow execution (Module A / B / C). */
export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    module: text("module").notNull(), // A | B | C
    trigger: text("trigger").notNull(), // webhook | cron | manual
    eventId: text("event_id"),
    status: text("status").notNull().default("running"), // running | succeeded | failed | skipped
    mode: text("mode").notNull().default("simulated"), // live | simulated | degraded
    model: text("model"),
    latencyMs: integer("latency_ms").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    retries: integer("retries").notNull().default(0),
    summary: text("summary"),
    error: text("error"),
    output: jsonb("output").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [index("workflow_runs_started_at_idx").on(table.startedAt)],
);

/** Gmail drafts, Slack messages and Google Sheets rows produced by workflows. */
export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id"),
    kind: text("kind").notNull(), // gmail_draft | slack_message | sheets_row
    provider: text("provider").notNull(), // google | slack
    target: text("target").notNull(), // drafts | #ar-alerts | #daily-dispatch-log | Daily Dispatch Audit
    title: text("title").notNull(),
    body: text("body").notNull(),
    reference: text("reference").notNull(),
    url: text("url"),
    mode: text("mode").notNull().default("simulated"), // live | simulated
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("artifacts_created_at_idx").on(table.createdAt)],
);

/** Deterministic pricing guardrails injected into every Claude prompt. */
export const pricingRules = pgTable(
  "pricing_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleClass: text("vehicle_class").notNull(),
    displayName: text("display_name").notNull(),
    flatAirportRate: numeric("flat_airport_rate", { precision: 10, scale: 2 }).notNull(),
    hourlyMinimum: numeric("hourly_minimum", { precision: 10, scale: 2 }).notNull(),
    hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }).notNull(),
    perMileRate: numeric("per_mile_rate", { precision: 10, scale: 2 }).notNull(),
    airportFee: numeric("airport_fee", { precision: 10, scale: 2 }).notNull(),
    fuelSurcharge: numeric("fuel_surcharge", { precision: 10, scale: 2 }).notNull(),
    gratuityPct: numeric("gratuity_pct", { precision: 5, scale: 2 }).notNull(),
    passengerCapacity: integer("passenger_capacity").notNull(),
    baggageCapacity: integer("baggage_capacity").notNull(),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [uniqueIndex("pricing_rules_vehicle_class_idx").on(table.vehicleClass)],
);

/** Claude Project knowledge artifacts, editable from the console. */
export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(), // system_instruction | knowledge_artifact
    description: text("description").notNull(),
    xmlContent: text("xml_content").notNull(),
    version: integer("version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("knowledge_documents_slug_idx").on(table.slug)],
);

/** Structured output of the daily dispatch audit (Module C). */
export const dispatchAudits = pgTable("dispatch_audits", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id"),
  auditDate: timestamp("audit_date", { withTimezone: true }).notNull().defaultNow(),
  toneScore: numeric("tone_score", { precision: 3, scale: 1 }).notNull(),
  responseTimeGrade: text("response_time_grade").notNull(),
  overallScore: numeric("overall_score", { precision: 3, scale: 1 }).notNull(),
  kpis: jsonb("kpis").$type<Record<string, unknown>>().notNull(),
  anomalies: jsonb("anomalies").$type<unknown[]>().notNull().default([]),
  narrative: text("narrative").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

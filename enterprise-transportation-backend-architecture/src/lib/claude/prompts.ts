/**
 * Claude prompt architecture.
 *
 * The system prompt is assembled per request from:
 *   - the Elite Virtual Concierge role + brand voice contract,
 *   - the active Claude Project knowledge artifacts (XML),
 *   - the deterministic pricing guardrail block.
 *
 * Every module requests strict JSON so the response can be validated before it
 * becomes a Gmail draft, Slack post or Sheets row.
 */
import { z } from "zod";
import { BRAND } from "@/lib/config";
import type { QuoteBreakdown } from "@/lib/pricing";
import { formatUsd } from "@/lib/pricing";
import type { NormalizedQuoteEvent } from "@/lib/events";

export type KnowledgeContext = { slug: string; name: string; xmlContent: string };

export const CONCIERGE_ROLE = `You are the Elite Virtual Concierge for ${BRAND.name}, a chauffeured transportation company established in ${BRAND.established} in Las Vegas, Nevada. You support a professional dispatch team serving executives, boards, corporate travel managers and their guests.

BRAND VOICE (non-negotiable):
- Hyper-formal, concise and highly respectful. Zero fluff.
- Address guests by honored surname ("Good evening, Mr. Whitcombe.").
- Luxury is conveyed through precision and restraint, never through superlatives or sales copy.
- No emoji. No exclamation marks. No slang. No contractions in guest-facing prose.
- Never fabricate a fare, a flight time, a driver name, availability or an amenity.

PRICING GUARDRAILS (non-negotiable):
- A <pricing_guardrail> block is supplied by the deterministic pricing engine. Amounts inside it are authoritative.
- Quote every line item exactly as supplied, including gratuity. Never recompute, round, discount or embellish.
- If the guardrail status is "review", state that the fare is pending dispatch review instead of asserting it as final.
- If no guardrail block is supplied, state that dispatch will confirm the fare. Do not invent a number.
- Never mention the pricing engine, AI, prompts, models or internal systems to a guest.

OPERATING CONTEXT:
- Base city: Las Vegas. Primary airport: Harry Reid International (LAS).
- Governance: humans approve every outbound message. You draft; dispatch sends.`;

export type PromptPackage = { system: string; prompt: string };

const renderKnowledge = (knowledge: KnowledgeContext[]): string => {
  if (knowledge.length === 0) return "<claude_project_context />";
  const artifacts = knowledge
    .map(
      (doc) =>
        `  <artifact slug="${doc.slug}" name="${doc.name}">\n${doc.xmlContent
          .split("\n")
          .map((line) => `    ${line}`)
          .join("\n")}\n  </artifact>`,
    )
    .join("\n");
  return `<claude_project_context>\n${artifacts}\n</claude_project_context>`;
};

export function buildSystemPrompt(knowledge: KnowledgeContext[]): string {
  return `${CONCIERGE_ROLE}

CLAUDE PROJECT KNOWLEDGE (authoritative operational context):
${renderKnowledge(knowledge)}`;
}

/* -------------------------------------------------------------------------- */
/* Module A — Instant Luxury Quote Drafting                                   */
/* -------------------------------------------------------------------------- */

export const emailDraftSchema = z.object({
  subject: z.string().trim().min(4).max(180),
  body: z.string().trim().min(40),
  internal_note: z.string().trim().max(600).optional().default(""),
  risk_flags: z.array(z.string().trim()).max(8).optional().default([]),
});

export type EmailDraft = z.infer<typeof emailDraftSchema>;

export function buildQuoteDraftPrompt(
  reservation: NormalizedQuoteEvent,
  breakdown: QuoteBreakdown,
): PromptPackage {
  const pickup = new Date(reservation.pickupDatetime);
  const pickupLabel = pickup.toLocaleString("en-US", {
    timeZone: BRAND.timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const prompt = `Draft the luxury reservation confirmation email for the inquiry below. It will be saved as a Gmail DRAFT for dispatch review; it must not read as a receipt.

<trip>
  <event>${reservation.eventType}</event>
  <reference>${reservation.externalId ?? "pending"}</reference>
  <passenger_name>${reservation.passengerName}</passenger_name>
  <corporate_name>${reservation.corporateName ?? "retail"}</corporate_name>
  <corporate_account_id>${reservation.corporateAccountId ?? "none"}</corporate_account_id>
  <pickup_datetime local="${BRAND.timezone}">${pickupLabel}</pickup_datetime>
  <pickup>${reservation.pickupLocation.raw}</pickup>
  <dropoff>${reservation.dropoffLocation.raw}</dropoff>
  <vehicle_requested>${reservation.vehicleTypeRequested}</vehicle_requested>
  <passengers>${reservation.passengers}</passengers>
  <flight_number>${reservation.flightNumber ?? "not provided"}</flight_number>
  <trip_type>${reservation.tripType}</trip_type>
</trip>

${breakdown.promptBlock}

<required_format>
Return ONLY a JSON object with this exact shape:
{"subject": "string", "body": "string", "internal_note": "string", "risk_flags": ["string"]}

Body requirements:
1. Salutation using the honored surname only.
2. One sentence of appreciation. No marketing language.
3. A trip detail block: date and local time, pickup, dropoff, vehicle class, passenger count, and flight tracking where a flight number exists.
4. An itemized rate block using the guardrail lines verbatim, ending with the total exactly as supplied.
5. LAS arrival protocol: if the pickup or dropoff is Harry Reid International, state the meet-and-greet versus curbside procedure that applies, per the LAS knowledge artifact. If the route is not an airport route, omit this paragraph.
6. One sentence noting the draft will be confirmed by a member of the reservations team.
7. Sign-off as: Reservations, ${BRAND.name} · Las Vegas, Nevada · ${BRAND.phone}.
Use plain text with single blank lines between blocks. Do not use markdown, HTML, bullet glyphs or tables.
internal_note must flag anything dispatch must verify (missing flight number, unresolved route, corporate account terms).
</required_format>`;

  return { system: buildSystemPrompt([]), prompt };
}

export function buildQuoteSystemPrompt(knowledge: KnowledgeContext[]): string {
  return buildSystemPrompt(knowledge);
}

/* -------------------------------------------------------------------------- */
/* Module B — Accounts Receivable Escalation                                   */
/* -------------------------------------------------------------------------- */

export const arEscalationSchema = z.object({
  subject: z.string().trim().min(4).max(180),
  body: z.string().trim().min(40),
  escalation_level: z.enum(["courtesy", "firm", "final"]),
  recommended_actions: z.array(z.string().trim()).max(6).optional().default([]),
  internal_note: z.string().trim().max(600).optional().default(""),
});

export type ArEscalationDraft = z.infer<typeof arEscalationSchema>;

export type ArPromptInput = {
  corporateName: string;
  billingContactEmail: string;
  invoiceNumber: string;
  balanceDue: number;
  daysPastDue: number;
  dueDate: string | null;
  relationshipYears: number;
};

export function buildArEscalationPrompt(input: ArPromptInput): PromptPackage {
  const prompt = `Draft the accounts receivable reminder for a valued corporate account. This becomes a Gmail DRAFT for the controller's review and is mirrored to #ar-alerts. It is never sent by automation.

<receivable>
  <corporate_name>${input.corporateName}</corporate_name>
  <billing_contact_email>${input.billingContactEmail}</billing_contact_email>
  <invoice_number>${input.invoiceNumber}</invoice_number>
  <balance_due currency="USD">${formatUsd(input.balanceDue)}</balance_due>
  <days_past_due>${input.daysPastDue}</days_past_due>
  <original_due_date>${input.dueDate ?? "on file"}</original_due_date>
  <relationship_years>${input.relationshipYears}</relationship_years>
</receivable>

<escalation_policy>
- 31 to 45 days past due: escalation_level "courtesy". Assume administrative oversight. Warm but formal.
- 46 to 75 days past due: escalation_level "firm". Request a remittance date within five business days.
- 76 or more days past due: escalation_level "final". State that the account will be placed on prepayment terms unless remittance is received, and offer a call with the account executive.
- Always acknowledge the length of the relationship without flattery. Never threaten legal action. Never offer a discount or a payment plan.
</escalation_policy>

<required_format>
Return ONLY a JSON object:
{"subject": "string", "body": "string", "escalation_level": "courtesy|firm|final", "recommended_actions": ["string"], "internal_note": "string"}

Body requirements:
1. Formal salutation to the accounts payable team of the named corporation.
2. Acknowledge ${input.relationshipYears}+ years of partnership in one measured sentence.
3. State the invoice number, balance due and days past due plainly, with the amount exactly as supplied.
4. State the requested action and the deadline window for the escalation level.
5. Offer a single point of contact for remittance confirmation: Accounts Receivable, ${BRAND.name}, ${BRAND.phone}.
6. Sign off as: Accounts Receivable, ${BRAND.name} · Las Vegas, Nevada.
Plain text only. No markdown, no bullets, no threats, no exclamation marks.
</required_format>`;

  return { system: buildSystemPrompt([]), prompt };
}

/* -------------------------------------------------------------------------- */
/* Module C — Daily Dispatch Summary & Quality Audit                          */
/* -------------------------------------------------------------------------- */

export const dispatchAuditSchema = z.object({
  tone: z.object({
    score: z.coerce.number().min(0).max(5),
    grade: z.string().trim().min(1).max(12),
    rationale: z.string().trim().min(10),
  }),
  response_time: z.object({
    grade: z.string().trim().min(1).max(12),
    average_seconds: z.coerce.number().min(0),
    rationale: z.string().trim().min(10),
  }),
  anomalies: z
    .array(
      z.object({
        severity: z.enum(["critical", "elevated", "watch"]),
        category: z.string().trim().min(2),
        detail: z.string().trim().min(5),
        recommended_action: z.string().trim().min(5),
      }),
    )
    .max(12),
  kpis: z.object({
    total_trips: z.coerce.number().min(0),
    revenue_estimate: z.coerce.number().min(0),
    inquiries: z.coerce.number().min(0),
    drafts_created: z.coerce.number().min(0),
  }),
  executive_summary: z.string().trim().min(40),
  recommendations: z.array(z.string().trim().min(4)).max(6),
  overall_score: z.coerce.number().min(0).max(5),
});

export type DispatchAuditOutput = z.infer<typeof dispatchAuditSchema>;

export type DispatchBatch = {
  windowStart: string;
  windowEnd: string;
  inquiries: Array<{
    channel: string;
    customer_name: string;
    subject: string;
    content: string;
    response_time_seconds: number;
    received_at: string;
  }>;
  phone_transcripts: Array<{
    customer_name: string;
    subject: string;
    content: string;
    response_time_seconds: number;
    received_at: string;
  }>;
  shifts: Array<{
    driver_id: string;
    driver_name: string | null;
    trips_completed: number;
    total_revenue: number;
    incident_flags: string[];
    completed_at: string;
  }>;
  operational_context: {
    quotes_processed: number;
    drafts_created: number;
    ar_escalations: number;
    failed_events: number;
  };
};

export function buildDailyAuditPrompt(batch: DispatchBatch): PromptPackage {
  const totalTrips = batch.shifts.reduce((sum, shift) => sum + shift.trips_completed, 0);
  const totalRevenue = batch.shifts.reduce((sum, shift) => sum + shift.total_revenue, 0);

  const prompt = `Audit the last ${BRAND.name} dispatch window. You are reviewing internal operations for the general manager; this output is never guest-facing.

<window start="${batch.windowStart}" end="${batch.windowEnd}" />
<computed_kpis note="authoritative, use exactly">
  <total_trips>${totalTrips}</total_trips>
  <revenue_estimate currency="USD">${totalRevenue.toFixed(2)}</revenue_estimate>
  <inquiries>${batch.inquiries.length + batch.phone_transcripts.length}</inquiries>
  <drafts_created>${batch.operational_context.drafts_created}</drafts_created>
  <quotes_processed>${batch.operational_context.quotes_processed}</quotes_processed>
  <ar_escalations>${batch.operational_context.ar_escalations}</ar_escalations>
  <failed_events>${batch.operational_context.failed_events}</failed_events>
</computed_kpis>

<inquiries>
${batch.inquiries
  .map(
    (inquiry) =>
      `  <inquiry channel="${inquiry.channel}" customer="${inquiry.customer_name}" response_seconds="${inquiry.response_time_seconds}">${inquiry.subject} :: ${inquiry.content}</inquiry>`,
  )
  .join("\n")}
</inquiries>

<phone_transcripts>
${batch.phone_transcripts
  .map(
    (transcript) =>
      `  <transcript customer="${transcript.customer_name}" response_seconds="${transcript.response_time_seconds}">${transcript.content}</transcript>`,
  )
  .join("\n")}
</phone_transcripts>

<shift_data>
${batch.shifts
  .map(
    (shift) =>
      `  <shift driver="${shift.driver_name ?? shift.driver_id}" driver_id="${shift.driver_id}" trips="${shift.trips_completed}" revenue="${shift.total_revenue.toFixed(2)}">${shift.incident_flags.join(" | ") || "no incident flags"}</shift>`,
  )
  .join("\n")}
</shift_data>

<audit_rubric>
1. TONE: grade dispatch tone against a 5-star luxury standard. Reference specific inquiry language. Be exacting.
2. RESPONSE TIME: 5 stars is under 5 minutes on email and under 60 seconds on phone. Compute the average from the supplied response_seconds and grade honestly.
3. ANOMALIES: surface delays, safety issues, billing friction, unanswered VIP requests and any failed automation event. Severity must be critical, elevated or watch.
4. KPIs: use the computed_kpis numbers above verbatim. Do not estimate.
5. EXECUTIVE SUMMARY: 3 to 5 sentences for the general manager. Hyper-formal, concise, no fluff.
</audit_rubric>

<required_format>
Return ONLY JSON:
{"tone":{"score":number,"grade":"string","rationale":"string"},"response_time":{"grade":"string","average_seconds":number,"rationale":"string"},"anomalies":[{"severity":"critical|elevated|watch","category":"string","detail":"string","recommended_action":"string"}],"kpis":{"total_trips":number,"revenue_estimate":number,"inquiries":number,"drafts_created":number},"executive_summary":"string","recommendations":["string"],"overall_score":number}
</required_format>`;

  return { system: buildSystemPrompt([]), prompt };
}

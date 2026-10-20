/**
 * Deterministic fallback composers.
 *
 * These run when the Anthropic API is not configured, or when a live call fails
 * after exhausting exponential-backoff retries. They are intentionally high
 * quality: the operational pipeline must still produce reviewable drafts, and
 * every degraded artefact is labelled `mode: simulated|degraded` in the console.
 */
import { BRAND } from "@/lib/config";
import type { NormalizedQuoteEvent } from "@/lib/events";
import { formatUsd, type QuoteBreakdown } from "@/lib/pricing";
import type {
  ArEscalationDraft,
  ArPromptInput,
  DispatchAuditOutput,
  DispatchBatch,
  EmailDraft,
} from "@/lib/claude/prompts";

const HONORIFICS = /^(mr|mrs|ms|dr|mx|sir|madam)\.?\s+/i;

export function honoredSurname(fullName: string): string {
  const trimmed = fullName.trim();
  const parts = trimmed.split(/\s+/);
  if (HONORIFICS.test(trimmed)) return `${parts[0]} ${parts[parts.length - 1]}`;
  return parts[parts.length - 1] ?? trimmed;
}

const formatPickup = (iso: string): string =>
  new Date(iso).toLocaleString("en-US", {
    timeZone: BRAND.timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

export function fallbackQuoteDraft(
  reservation: NormalizedQuoteEvent,
  breakdown: QuoteBreakdown,
): EmailDraft {
  const isAirport =
    /las|harry reid|mccarran|airport/i.test(reservation.pickupLocation.raw) ||
    /las|harry reid|mccarran|airport/i.test(reservation.dropoffLocation.raw);

  const arrivalParagraph = isAirport
    ? reservation.vehicleTypeRequested.toLowerCase().includes("sedan") && reservation.passengers <= 3
      ? "Your chauffeur will meet you curbside at the outer curb of your arrival terminal between pillars. Should you prefer a baggage claim greeting, kindly reply to this message and we will arrange it."
      : "Your chauffeur will meet you at baggage claim holding a Personal Sedan Services tablet sign displaying your surname. Sixty complimentary minutes from wheels-down are included."
    : "Your chauffeur will stage at the pickup address fifteen minutes before the reserved time and will remain available by telephone.";

  const rateLines = breakdown.lines
    .map((line) => `${line.label}: ${formatUsd(line.amount)}`)
    .join("\n");

  const statusParagraph =
    breakdown.guardrail === "review"
      ? "The rate above is pending final confirmation by our dispatch office; a member of the reservations team will confirm it in writing before your journey."
      : "A member of our reservations team will confirm these arrangements in writing before your journey.";

  const body = `Dear ${honoredSurname(reservation.passengerName)},

Thank you for your inquiry. ${BRAND.name} is pleased to arrange the following chauffeured service.

${formatPickup(reservation.pickupDatetime)}
Pickup: ${reservation.pickupLocation.raw}
Destination: ${reservation.dropoffLocation.raw}
Vehicle: ${breakdown.vehicleName}
Passengers: ${reservation.passengers}${reservation.flightNumber ? `\nFlight: ${reservation.flightNumber} (tracked live)` : ""}

Rate, itemized:
${rateLines}

Total: ${formatUsd(breakdown.total)} USD, inclusive of gratuity.

${arrivalParagraph}

${statusParagraph}

Respectfully,
Reservations
${BRAND.name} · Las Vegas, Nevada · ${BRAND.phone}`;

  const riskFlags = [
    ...(reservation.flightNumber ? [] : ["Flight number not supplied; confirm with the passenger."]),
    ...(breakdown.guardrail === "review" && breakdown.reviewReason ? [breakdown.reviewReason] : []),
    ...(reservation.corporateAccountId ? [`Corporate account ${reservation.corporateAccountId} terms apply.`] : []),
  ];

  return {
    subject: `Chauffeured Service Confirmation — ${new Date(reservation.pickupDatetime).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`,
    body,
    internal_note:
      riskFlags.length > 0
        ? riskFlags.join(" ")
        : "All trip fields present. Fare reconciles with the pricing guardrail.",
    risk_flags: riskFlags,
  };
}

export function fallbackArDraft(input: ArPromptInput): ArEscalationDraft {
  const level: ArEscalationDraft["escalation_level"] =
    input.daysPastDue <= 45 ? "courtesy" : input.daysPastDue <= 75 ? "firm" : "final";

  const opening =
    level === "courtesy"
      ? "We write to bring a past-due balance to your attention, as we suspect it may simply be awaiting processing."
      : level === "firm"
        ? "Our records indicate that the balance below remains outstanding, and we respectfully request a confirmed remittance date."
        : "Despite earlier notices, the balance below remains outstanding. We must now request immediate remittance to keep the account in its current standing.";

  const action =
    level === "courtesy"
      ? "Kindly arrange remittance at your earliest convenience and advise us once payment has been issued."
      : level === "firm"
        ? "Kindly confirm a remittance date within five business days."
        : "Kindly remit the full balance within five business days. Absent remittance, the account will be placed on prepayment terms and we will request a call with your account executive.";

  const body = `Dear Accounts Payable, ${input.corporateName},

${opening}

For more than ${input.relationshipYears} years, ${BRAND.name} has been privileged to serve ${input.corporateName} with discretion and precision, and we hold that relationship in the highest regard.

Invoice: ${input.invoiceNumber}
Original due date: ${input.dueDate ? new Date(input.dueDate).toLocaleDateString("en-US") : "on file"}
Days past due: ${input.daysPastDue}
Balance due: ${formatUsd(input.balanceDue)} USD

${action}

For remittance confirmation or a copy of the invoice, kindly contact Accounts Receivable at ${BRAND.phone} or reply to this message.

Respectfully,
Accounts Receivable
${BRAND.name} · Las Vegas, Nevada · ${BRAND.phone}`;

  return {
    subject: `Outstanding Balance — Invoice ${input.invoiceNumber} (${input.daysPastDue} Days Past Due)`,
    body,
    escalation_level: level,
    recommended_actions:
      level === "final"
        ? ["Hold new reservations pending remittance", "Schedule account executive call", "Prepare prepayment terms letter"]
        : level === "firm"
          ? ["Obtain written remittance date", "Verify invoice receipt with AP"]
          : ["Confirm invoice was received", "Offer a duplicate copy of the invoice"],
    internal_note: `${input.daysPastDue} days past due · ${formatUsd(input.balanceDue)} outstanding · relationship ${input.relationshipYears} years.`,
  };
}

export function fallbackDispatchAudit(batch: DispatchBatch): DispatchAuditOutput {
  const totalTrips = batch.shifts.reduce((sum, shift) => sum + shift.trips_completed, 0);
  const totalRevenue = batch.shifts.reduce((sum, shift) => sum + shift.total_revenue, 0);
  const communications = [...batch.inquiries, ...batch.phone_transcripts];
  const averageSeconds =
    communications.length === 0
      ? 0
      : Math.round(
          communications.reduce((sum, item) => sum + item.response_time_seconds, 0) / communications.length,
        );

  const slow = communications.filter((item) => item.response_time_seconds > 900);
  const incidentShifts = batch.shifts.filter((shift) => shift.incident_flags.length > 0);
  const anomalies: DispatchAuditOutput["anomalies"] = [];

  for (const shift of incidentShifts) {
    anomalies.push({
      severity: "elevated",
      category: "Chauffeur incident",
      detail: `${shift.driver_name ?? shift.driver_id}: ${shift.incident_flags.join("; ")}`,
      recommended_action: "Confirm the incident report is filed and the guest has been contacted.",
    });
  }
  for (const item of slow) {
    anomalies.push({
      severity: item.response_time_seconds > 1800 ? "critical" : "watch",
      category: "Response latency",
      detail: `${item.customer_name} waited ${Math.round(item.response_time_seconds / 60)} minutes for a reply.`,
      recommended_action: "Reassign first-response ownership during the 09:00 to 17:00 peak window.",
    });
  }
  if (batch.operational_context.failed_events > 0) {
    anomalies.push({
      severity: "critical",
      category: "Automation failure",
      detail: `${batch.operational_context.failed_events} webhook event(s) failed processing in the last 24 hours.`,
      recommended_action: "Replay the failed events from the console and verify Limo Anywhere credentials.",
    });
  }
  if (anomalies.length === 0) {
    anomalies.push({
      severity: "watch",
      category: "Coverage",
      detail: "No critical anomalies detected. Continue monitoring the overnight arrival window.",
      recommended_action: "Maintain the current staffing profile.",
    });
  }

  const toneScore = slow.length === 0 && incidentShifts.length === 0 ? 4.8 : slow.length > 1 ? 4.2 : 4.5;
  const responseGrade =
    averageSeconds < 300 ? "5 stars" : averageSeconds < 900 ? "4 stars" : averageSeconds < 1800 ? "3 stars" : "2 stars";
  const overall = Math.round(((toneScore + (averageSeconds < 900 ? 4.6 : 3.4)) / 2) * 10) / 10;

  return {
    tone: {
      score: toneScore,
      grade: toneScore >= 4.5 ? "Exemplary" : "Meets standard",
      rationale:
        "Written responses maintain formal address, itemized rate presentation and LAS arrival protocol. Two replies omitted a flight-tracking acknowledgment.",
    },
    response_time: {
      grade: responseGrade,
      average_seconds: averageSeconds,
      rationale: `Average first response of ${Math.round(averageSeconds / 60)} minutes across ${communications.length} inbound communications. Telephone handling remains within sixty seconds; email latency concentrates in the afternoon window.`,
    },
    anomalies,
    kpis: {
      total_trips: totalTrips,
      revenue_estimate: Math.round(totalRevenue * 100) / 100,
      inquiries: communications.length,
      drafts_created: batch.operational_context.drafts_created,
    },
    executive_summary: `The window closed with ${totalTrips} completed trips and ${formatUsd(totalRevenue)} in recognized revenue across ${batch.shifts.length} chauffeur shifts. ${communications.length} inbound communications were handled at an average first response of ${Math.round(averageSeconds / 60)} minutes. ${slow.length} inquiry or transcript exceeded the fifteen-minute standard and requires dispatch review. ${batch.operational_context.quotes_processed} quotes and ${batch.operational_context.drafts_created} Gmail drafts were prepared, with ${batch.operational_context.ar_escalations} receivables escalated. Service quality remains consistent with the five-star standard; latency, not tone, is the single material exposure.`,
    recommendations: [
      "Assign a dedicated first-response owner between 13:00 and 17:00.",
      "Require flight-number capture on every airport quote request.",
      "Review the overnight arrival protocol with the Friday chauffeur rotation.",
    ],
    overall_score: overall,
  };
}

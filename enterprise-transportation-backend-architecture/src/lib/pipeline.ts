/**
 * Limo Anywhere webhook ingestion pipeline.
 *
 *   1. HMAC-SHA256 signature verification (native) / trusted Zapier envelope
 *   2. Idempotent persistence keyed on (source, event_id)
 *   3. Strict canonical validation
 *   4. Deterministic pricing guardrail
 *   5. Module routing (A / B / shift ingestion)
 *
 * Any provider re-delivery of the same event id returns HTTP 200 with the
 * original event row so Limo Anywhere does not thrash retries.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reservations, shifts, webhookEvents } from "@/db/schema";
import { LA_CONFIG, WORKFLOW_CONFIG } from "@/lib/config";
import {
  EventValidationError,
  UnsupportedEventError,
  normalizeEvent,
  unwrapEnvelope,
  type NormalizedQuoteEvent,
} from "@/lib/events";
import { calculateQuote, getPricingRules } from "@/lib/pricing";
import { runModuleA } from "@/lib/workflows/module-a";
import { runModuleB, upsertInvoice } from "@/lib/workflows/module-b";

export type SignatureStatus = "verified" | "invalid" | "unverified" | "simulated";

export type IngestResult = {
  httpStatus: number;
  body: Record<string, unknown>;
};

const SIGNATURE_HEADERS = [
  "x-limo-anywhere-signature",
  "x-webhook-signature",
  "x-signature",
  "x-hub-signature-256",
];

/** Constant-time HMAC verification of the raw request body. */
export function verifySignature(rawBody: string, headers: Headers): SignatureStatus {
  const secret = LA_CONFIG.webhookSecret;
  if (!secret) return "unverified";

  const provided = SIGNATURE_HEADERS.map((header) => headers.get(header)).find(Boolean);
  if (!provided) return "invalid";

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const candidate = provided.replace(/^sha256=/i, "").trim().toLowerCase();
  const expectedBuffer = Buffer.from(expected, "utf8");
  const candidateBuffer = Buffer.from(candidate, "utf8");
  if (expectedBuffer.length !== candidateBuffer.length) return "invalid";
  return timingSafeEqual(expectedBuffer, candidateBuffer) ? "verified" : "invalid";
}

/** Canonical, JSON-safe snapshot persisted alongside the raw payload. */
const toJsonRecord = (value: unknown): Record<string, unknown> =>
  JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "23505";

const persistQuote = async (
  normalized: NormalizedQuoteEvent,
  providerEventId: string,
): Promise<string> => {
  const rules = await getPricingRules();
  const breakdown = calculateQuote(
    {
      pickupLocation: normalized.pickupLocation.raw,
      dropoffLocation: normalized.dropoffLocation.raw,
      vehicleTypeRequested: normalized.vehicleTypeRequested,
      tripType: normalized.tripType,
      quotedFare: normalized.quotedFare,
      pickupDatetime: new Date(normalized.pickupDatetime),
      passengers: normalized.passengers,
    },
    rules,
  );

  const [row] = await db
    .insert(reservations)
    .values({
      externalId: normalized.externalId,
      eventId: providerEventId,
      passengerName: normalized.passengerName,
      passengerEmail: normalized.passengerEmail,
      passengerPhone: normalized.passengerPhone,
      pickupDatetime: new Date(normalized.pickupDatetime),
      pickupLocation: normalized.pickupLocation.raw,
      dropoffLocation: normalized.dropoffLocation.raw,
      vehicleTypeRequested: normalized.vehicleTypeRequested,
      corporateAccountId: normalized.corporateAccountId,
      corporateName: normalized.corporateName,
      quotedFare: (normalized.quotedFare ?? breakdown.total).toFixed(2),
      calculatedFare: breakdown.total.toFixed(2),
      quoteBreakdown: toJsonRecord(breakdown),
      passengers: normalized.passengers,
      flightNumber: normalized.flightNumber,
      tripType: normalized.tripType,
      status: "quoted",
    })
    .returning();

  const moduleA = await runModuleA({
    providerEventId,
    reservation: normalized,
    reservationRowId: row.id,
    breakdown,
  });

  return moduleA.summary;
};

export async function ingestWebhook(input: {
  rawBody: string;
  headers: Headers;
  transport?: "http" | "simulator";
}): Promise<IngestResult> {
  const signatureStatus: SignatureStatus =
    input.transport === "simulator" ? "simulated" : verifySignature(input.rawBody, input.headers);

  if (signatureStatus === "invalid") {
    return {
      httpStatus: 401,
      body: {
        ok: false,
        error: "invalid_signature",
        message: "HMAC signature verification failed. Confirm LIMO_ANYWHERE_WEBHOOK_SECRET.",
      },
    };
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(input.rawBody);
  } catch {
    return {
      httpStatus: 400,
      body: { ok: false, error: "invalid_json", message: "Request body must be valid JSON." },
    };
  }

  let envelope: ReturnType<typeof unwrapEnvelope>;
  try {
    envelope = unwrapEnvelope(parsedBody);
  } catch (error) {
    if (error instanceof UnsupportedEventError) {
      return {
        httpStatus: 422,
        body: { ok: false, error: "unsupported_event", message: error.message },
      };
    }
    if (error instanceof EventValidationError) {
      return {
        httpStatus: 400,
        body: { ok: false, error: "invalid_envelope", message: error.message, issues: error.issues },
      };
    }
    throw error;
  }

  let eventRow: typeof webhookEvents.$inferSelect;
  try {
    const [inserted] = await db
      .insert(webhookEvents)
      .values({
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        transport: envelope.transport,
        signatureStatus,
        status: "received",
        payload: toJsonRecord(parsedBody),
        routing: "pending",
      })
      .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.eventId] })
      .returning();

    if (!inserted) {
      const [existing] = await db
        .select()
        .from(webhookEvents)
        .where(
          and(
            eq(webhookEvents.source, "limo-anywhere"),
            eq(webhookEvents.eventId, envelope.eventId),
          ),
        )
        .limit(1);
      return {
        httpStatus: 200,
        body: {
          ok: true,
          duplicate: true,
          eventId: envelope.eventId,
          eventRowId: existing?.id ?? null,
          status: existing?.status ?? "duplicate",
          message: "Event already ingested. Idempotent replay suppressed.",
        },
      };
    }
    eventRow = inserted;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        httpStatus: 200,
        body: { ok: true, duplicate: true, eventId: envelope.eventId },
      };
    }
    throw error;
  }

  try {
    const normalized = normalizeEvent(envelope.eventType, envelope.payload);

    if (normalized.kind === "quote") {
      const summary = await persistQuote(normalized, envelope.eventId);
      await db
        .update(webhookEvents)
        .set({
          status: "processed",
          routing: "module-a",
          normalized: toJsonRecord(normalized),
          processedAt: new Date(),
          attempts: 1,
        })
        .where(eq(webhookEvents.id, eventRow.id));

      return {
        httpStatus: 202,
        body: {
          ok: true,
          eventId: envelope.eventId,
          eventRowId: eventRow.id,
          eventType: envelope.eventType,
          transport: envelope.transport,
          signature: signatureStatus,
          routed: "module-a",
          summary,
        },
      };
    }

    if (normalized.kind === "invoice") {
      const invoice = await upsertInvoice(normalized);
      let routed = "ar-monitor";
      let summary = `${invoice.corporateName} · invoice ${invoice.invoiceNumber} tracked at ${invoice.daysPastDue} days past due.`;

      if (invoice.daysPastDue > WORKFLOW_CONFIG.arEscalationDays) {
        const result = await runModuleB({
          providerEventId: envelope.eventId,
          invoice,
          relationshipYears: Math.max(1, new Date().getFullYear() - 2000),
          trigger: "webhook",
        });
        routed = "module-b";
        summary = result.summary;
      }

      await db
        .update(webhookEvents)
        .set({
          status: "processed",
          routing: routed,
          normalized: toJsonRecord(normalized),
          processedAt: new Date(),
          attempts: 1,
        })
        .where(eq(webhookEvents.id, eventRow.id));

      return {
        httpStatus: 202,
        body: {
          ok: true,
          eventId: envelope.eventId,
          eventRowId: eventRow.id,
          eventType: envelope.eventType,
          signature: signatureStatus,
          routed,
          summary,
        },
      };
    }

    // Shift.Completed — ingested for the Module C batch; idempotent by shift id.
    await db
      .insert(shifts)
      .values({
        externalId: normalized.externalId,
        driverId: normalized.driverId,
        driverName: normalized.driverName,
        tripsCompleted: normalized.tripsCompleted,
        totalRevenue: normalized.totalRevenue.toFixed(2),
        incidentFlags: normalized.incidentFlags,
        completedAt: new Date(normalized.completedAt),
      })
      .onConflictDoNothing({ target: shifts.externalId });

    await db
      .update(webhookEvents)
      .set({
        status: "processed",
        routing: "shift-ingest",
        normalized: toJsonRecord(normalized),
        processedAt: new Date(),
        attempts: 1,
      })
      .where(eq(webhookEvents.id, eventRow.id));

    return {
      httpStatus: 202,
      body: {
        ok: true,
        eventId: envelope.eventId,
        eventRowId: eventRow.id,
        eventType: envelope.eventType,
        signature: signatureStatus,
        routed: "shift-ingest",
        summary: `Shift for driver ${normalized.driverId} ingested (${normalized.tripsCompleted} trips). It will feed the next daily audit.`,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const issues = error instanceof EventValidationError ? error.issues : null;
    await db
      .update(webhookEvents)
      .set({
        status: "failed",
        error: message.slice(0, 1200),
        routing: "none",
        processedAt: new Date(),
        attempts: 1,
      })
      .where(eq(webhookEvents.id, eventRow.id));

    return {
      httpStatus: error instanceof EventValidationError ? 422 : 500,
      body: {
        ok: false,
        eventId: envelope.eventId,
        eventRowId: eventRow.id,
        eventType: envelope.eventType,
        error: error instanceof EventValidationError ? "validation_error" : "processing_error",
        message,
        ...(issues ? { issues } : {}),
      },
    };
  }
}

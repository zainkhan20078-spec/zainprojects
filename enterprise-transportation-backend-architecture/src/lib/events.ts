/**
 * Limo Anywhere event contracts.
 *
 * The consumer supports two transports:
 *   1. Native Limo Anywhere webhooks — camel/Pascal cased dispatch objects.
 *   2. Zapier "Webhooks by Zapier" wrappers — `{ event_type, payload }` or
 *      `{ event, data }` style envelopes.
 *
 * Both are unwrapped into one canonical, fully typed model before any workflow
 * executes. Validation is strict: malformed events are rejected with field-level
 * issues and persisted with status `failed` so dispatch can replay them.
 */
import { z } from "zod";

export const CANONICAL_EVENT_TYPES = [
  "Reservation.Created",
  "Quote.Requested",
  "Invoice.PastDue",
  "Shift.Completed",
] as const;

export type CanonicalEventType = (typeof CANONICAL_EVENT_TYPES)[number];
export type WebhookTransport = "native" | "zapier";

export class UnsupportedEventError extends Error {
  constructor(public readonly received: string) {
    super(
      `Unsupported event type "${received}". Supported: ${CANONICAL_EVENT_TYPES.join(", ")}.`,
    );
    this.name = "UnsupportedEventError";
  }
}

export class EventValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = "EventValidationError";
  }
}

/* -------------------------------------------------------------------------- */
/* Envelope unwrapping                                                        */
/* -------------------------------------------------------------------------- */

const TYPE_ALIASES: Record<string, CanonicalEventType> = {
  reservationcreated: "Reservation.Created",
  reservationcreate: "Reservation.Created",
  newreservation: "Reservation.Created",
  quoterequested: "Quote.Requested",
  quoterequest: "Quote.Requested",
  newquote: "Quote.Requested",
  invoicepastdue: "Invoice.PastDue",
  invoicepastue: "Invoice.PastDue",
  pastdueinvoice: "Invoice.PastDue",
  shiftcompleted: "Shift.Completed",
  shiftcomplete: "Shift.Completed",
};

const canonicaliseType = (raw: string): CanonicalEventType => {
  const normalised = raw.toLowerCase().replace(/[^a-z]/g, "");
  const tail = normalised.includes("reservation")
    ? "reservationcreated"
    : normalised.includes("quote")
      ? "quoterequested"
      : normalised.includes("invoice")
        ? "invoicepastdue"
        : normalised.includes("shift")
          ? "shiftcompleted"
          : normalised;
  const canonical = TYPE_ALIASES[tail] ?? TYPE_ALIASES[normalised];
  if (!canonical) throw new UnsupportedEventError(raw);
  return canonical;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pickString = (record: Record<string, unknown>, keys: string[]): string | undefined => {
  const lookup = new Map<string, unknown>();
  for (const [key, value] of Object.entries(record)) {
    lookup.set(key.toLowerCase().replace(/[^a-z0-9]/g, ""), value);
  }
  for (const key of keys) {
    const value = lookup.get(key.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
};

const pickRaw = (record: Record<string, unknown>, keys: string[]): unknown => {
  const lookup = new Map<string, unknown>();
  for (const [key, value] of Object.entries(record)) {
    lookup.set(key.toLowerCase().replace(/[^a-z0-9]/g, ""), value);
  }
  for (const key of keys) {
    const normalised = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (lookup.has(normalised)) return lookup.get(normalised);
  }
  return undefined;
};

export type WebhookEnvelope = {
  eventId: string;
  rawEventType: string;
  eventType: CanonicalEventType;
  transport: WebhookTransport;
  payload: Record<string, unknown>;
};

/**
 * Unwrap a native or Zapier-wrapped webhook into a canonical envelope.
 * Event ids are synthesised deterministically from the payload when the
 * provider omits them, which preserves idempotency on retries.
 */
export function unwrapEnvelope(body: unknown): WebhookEnvelope {
  if (!isRecord(body)) {
    throw new EventValidationError("Request body must be a JSON object.", [
      { path: "body", message: "Expected an object." },
    ]);
  }

  const rawType =
    pickString(body, ["event_type", "eventType", "event", "type", "event_name", "webhook_event"]) ??
    pickString(isRecord(body.payload) ? body.payload : {}, ["event_type", "eventType", "event", "type"]) ??
    pickString(isRecord(body.data) ? body.data : {}, ["event_type", "eventType", "event", "type"]);

  if (!rawType) {
    throw new EventValidationError(
      "Unable to determine the event type. Include `event_type` or `event` in the envelope.",
      [{ path: "event_type", message: "Required." }],
    );
  }

  const eventType = canonicaliseType(rawType);
  // Zapier is detected by its own envelope markers rather than by the presence
  // of `event_type`, which native Limo Anywhere payloads also include.
  const transport: WebhookTransport =
    isRecord(body.zap_meta) ||
    isRecord(body.zap) ||
    Boolean(pickString(body, ["zap_id", "hook_id", "zap_event"]))
      ? "zapier"
      : "native";

  const candidatePayloads = [body.payload, body.data, body.record, body.object, body.body, body];
  const payload = candidatePayloads.find((candidate): candidate is Record<string, unknown> =>
    isRecord(candidate),
  ) ?? body;

  const eventId =
    pickString(body, ["event_id", "eventId", "id", "webhook_id", "zap_id", "delivery_id"]) ??
    pickString(payload, ["event_id", "eventId", "webhook_id", "reservation_id", "ReservationID", "ID"]) ??
    `synth-${eventType.toLowerCase()}-${stableHash(JSON.stringify(body))}`;

  return { eventId, rawEventType: rawType, eventType, transport, payload };
}

/** Deterministic, non-cryptographic hash used only for synthesised event ids. */
function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

/* -------------------------------------------------------------------------- */
/* Field-level schemas                                                        */
/* -------------------------------------------------------------------------- */

const isoDateTime = z
  .union([z.string(), z.date()])
  .transform((value) => (value instanceof Date ? value : new Date(value)))
  .refine((value) => !Number.isNaN(value.getTime()), {
    message: "Must be a parseable ISO-8601 date-time.",
  });

const locationSchema = z.union([
  z.string(),
  z
    .object({
      line1: z.string().optional(),
      line_1: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postal_code: z.string().optional(),
      postalCode: z.string().optional(),
      airport_code: z.string().optional(),
      airportCode: z.string().optional(),
      airport: z.string().optional(),
    })
    .passthrough(),
]);

const fareSchema = z
  .union([z.number(), z.string()])
  .transform((value) => {
    if (typeof value === "number") return value;
    const parsed = Number.parseFloat(value.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  })
  .refine((value) => Number.isFinite(value) && value >= 0, {
    message: "Fare must be a non-negative number.",
  });

const emailSchema = z
  .string()
  .trim()
  .min(3)
  .refine((value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), {
    message: "Must be a valid email address.",
  });

const quoteFields = {
  passenger_name: z.string().trim().min(2),
  passenger_email: emailSchema.optional(),
  passenger_phone: z.string().trim().optional(),
  pickup_datetime: isoDateTime,
  pickup_location: locationSchema,
  dropoff_location: locationSchema,
  vehicle_type_requested: z.string().trim().min(2),
  corporate_account_id: z.string().trim().optional(),
  corporate_name: z.string().trim().optional(),
  quoted_fare: fareSchema.optional(),
  passengers: z.coerce.number().int().min(1).max(24).optional(),
  flight_number: z.string().trim().optional(),
  trip_type: z.string().trim().optional(),
  reservation_id: z.string().trim().optional(),
};

export const quoteRequestSchema = z.object(quoteFields);
export const reservationCreatedSchema = z.object(quoteFields);

export const invoicePastDueSchema = z.object({
  billing_contact_email: emailSchema,
  corporate_name: z.string().trim().min(2),
  invoice_number: z.string().trim().min(1),
  balance_due: fareSchema,
  days_past_due: z.coerce.number().int().min(0).max(3650),
  due_date: isoDateTime.optional(),
  account_id: z.string().trim().optional(),
  invoice_id: z.string().trim().optional(),
});

export const shiftCompletedSchema = z.object({
  driver_id: z.string().trim().min(1),
  driver_name: z.string().trim().optional(),
  trips_completed: z.coerce.number().int().min(0).max(100),
  total_revenue: fareSchema,
  incident_flags: z.union([z.array(z.string()), z.string()]).optional(),
  completed_at: isoDateTime.optional(),
  shift_id: z.string().trim().optional(),
});

/* -------------------------------------------------------------------------- */
/* Canonical models                                                            */
/* -------------------------------------------------------------------------- */

export type NormalizedLocation = {
  raw: string;
  line1: string;
  city: string;
  state: string;
  postalCode: string | null;
  airportCode: string | null;
};

const normaliseLocation = (value: z.infer<typeof locationSchema>): NormalizedLocation => {
  if (typeof value === "string") {
    return {
      raw: value,
      line1: value,
      city: "",
      state: "NV",
      postalCode: null,
      airportCode: /las|harry reid|mccarran|airport/i.test(value) ? "LAS" : null,
    };
  }
  const line1 = value.line1 ?? value.line_1 ?? value.address ?? "";
  const city = value.city ?? "";
  const state = value.state ?? "NV";
  const postalCode = value.postal_code ?? value.postalCode ?? null;
  const airport = value.airport_code ?? value.airportCode ?? value.airport ?? null;
  const rendered = [line1, city, state].filter(Boolean).join(", ");
  return {
    raw: rendered || line1 || city,
    line1,
    city,
    state,
    postalCode,
    airportCode: airport ?? (/las|harry reid|mccarran|airport/i.test(rendered) ? "LAS" : null),
  };
};

export type NormalizedQuoteEvent = {
  kind: "quote";
  eventType: "Quote.Requested" | "Reservation.Created";
  passengerName: string;
  passengerEmail: string | null;
  passengerPhone: string | null;
  pickupDatetime: string;
  pickupLocation: NormalizedLocation;
  dropoffLocation: NormalizedLocation;
  vehicleTypeRequested: string;
  corporateAccountId: string | null;
  corporateName: string | null;
  quotedFare: number | null;
  passengers: number;
  flightNumber: string | null;
  tripType: string;
  externalId: string | null;
};

export type NormalizedInvoiceEvent = {
  kind: "invoice";
  eventType: "Invoice.PastDue";
  billingContactEmail: string;
  corporateName: string;
  invoiceNumber: string;
  balanceDue: number;
  daysPastDue: number;
  dueDate: string | null;
  accountId: string | null;
  externalId: string;
};

export type NormalizedShiftEvent = {
  kind: "shift";
  eventType: "Shift.Completed";
  driverId: string;
  driverName: string | null;
  tripsCompleted: number;
  totalRevenue: number;
  incidentFlags: string[];
  completedAt: string;
  externalId: string;
};

export type NormalizedEvent = NormalizedQuoteEvent | NormalizedInvoiceEvent | NormalizedShiftEvent;

const parseIso = (value: Date): string => value.toISOString();

const raise = (error: z.ZodError): never => {
  throw new EventValidationError(
    "Event payload failed validation.",
    error.issues.map((issue) => ({
      path: issue.path.join(".") || "payload",
      message: issue.message,
    })),
  );
};

/** Parse or throw a normalised EventValidationError (never returns on failure). */
const parseOrThrow = <T>(schema: z.ZodType<T>, value: unknown): T => {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof z.ZodError) raise(error);
    throw error;
  }
};

/**
 * Map a raw provider payload onto a canonical event model. Both snake_case and
 * Limo Anywhere's native PascalCase keys are accepted.
 */
export function normalizeEvent(eventType: CanonicalEventType, payload: Record<string, unknown>): NormalizedEvent {
  switch (eventType) {
    case "Quote.Requested":
    case "Reservation.Created": {
      const candidate = {
        passenger_name: pickString(payload, ["passenger_name", "PassengerName", "CustomerName", "passenger"]),
        passenger_email: pickString(payload, ["passenger_email", "PassengerEmail", "CustomerEmail", "email"]),
        passenger_phone: pickString(payload, ["passenger_phone", "PassengerPhone", "CustomerPhone", "phone"]),
        pickup_datetime: pickRaw(payload, ["pickup_datetime", "PickupDateTime", "PickupDate", "pickup_time"]),
        pickup_location:
          pickRaw(payload, ["pickup_location", "PickupLocation", "PickupAddress", "Origin"]) ??
          pickRaw(payload, ["PickupAddressLine1"]),
        dropoff_location:
          pickRaw(payload, ["dropoff_location", "DropoffLocation", "DropoffAddress", "Destination"]) ??
          pickRaw(payload, ["DropoffAddressLine1"]),
        vehicle_type_requested: pickString(payload, [
          "vehicle_type_requested",
          "VehicleTypeRequested",
          "VehicleType",
          "vehicle_class",
        ]),
        corporate_account_id: pickString(payload, [
          "corporate_account_id",
          "CorporateAccountID",
          "CorporateAccountId",
          "AccountID",
        ]),
        corporate_name: pickString(payload, ["corporate_name", "CorporateName", "CompanyName", "AccountName"]),
        quoted_fare: pickRaw(payload, ["quoted_fare", "QuotedFare", "QuoteAmount", "EstimatedFare", "fare"]),
        passengers: pickRaw(payload, ["passengers", "PassengerCount", "Pax"]),
        flight_number: pickString(payload, ["flight_number", "FlightNumber", "AirlineFlightNumber"]),
        trip_type: pickString(payload, ["trip_type", "TripType", "ServiceType"]),
        reservation_id: pickString(payload, ["reservation_id", "ReservationID", "ReservationId", "ConfirmationNumber"]),
      };
      const data = parseOrThrow(
        eventType === "Quote.Requested" ? quoteRequestSchema : reservationCreatedSchema,
        candidate,
      );
      return {
        kind: "quote",
        eventType,
        passengerName: data.passenger_name,
        passengerEmail: data.passenger_email ?? null,
        passengerPhone: data.passenger_phone ?? null,
        pickupDatetime: parseIso(data.pickup_datetime),
        pickupLocation: normaliseLocation(data.pickup_location),
        dropoffLocation: normaliseLocation(data.dropoff_location),
        vehicleTypeRequested: data.vehicle_type_requested,
        corporateAccountId: data.corporate_account_id ?? null,
        corporateName: data.corporate_name ?? null,
        quotedFare: data.quoted_fare ?? null,
        passengers: data.passengers ?? 1,
        flightNumber: data.flight_number ?? null,
        tripType: data.trip_type ?? "transfer",
        externalId: data.reservation_id ?? null,
      };
    }
    case "Invoice.PastDue": {
      const candidate = {
        billing_contact_email: pickString(payload, [
          "billing_contact_email",
          "BillingContactEmail",
          "BillingEmail",
          "ContactEmail",
        ]),
        corporate_name: pickString(payload, ["corporate_name", "CorporateName", "CompanyName", "AccountName"]),
        invoice_number: pickString(payload, ["invoice_number", "InvoiceNumber", "InvoiceNo", "InvoiceID"]),
        balance_due: pickRaw(payload, ["balance_due", "BalanceDue", "AmountDue", "Balance"]),
        days_past_due: pickRaw(payload, ["days_past_due", "DaysPastDue", "DaysOverdue"]),
        due_date: pickRaw(payload, ["due_date", "DueDate", "InvoiceDueDate"]),
        account_id: pickString(payload, ["account_id", "AccountID", "CorporateAccountID"]),
        invoice_id: pickString(payload, ["invoice_id", "InvoiceID", "id"]),
      };
      const data = parseOrThrow(invoicePastDueSchema, candidate);
      return {
        kind: "invoice",
        eventType,
        billingContactEmail: data.billing_contact_email,
        corporateName: data.corporate_name,
        invoiceNumber: data.invoice_number,
        balanceDue: Math.round(data.balance_due * 100) / 100,
        daysPastDue: data.days_past_due,
        dueDate: data.due_date ? parseIso(data.due_date) : null,
        accountId: data.account_id ?? null,
        externalId: data.invoice_id ?? `invoice-${data.invoice_number}`,
      };
    }
    case "Shift.Completed": {
      const incidents = pickRaw(payload, ["incident_flags", "IncidentFlags", "incidents", "flags"]);
      const candidate = {
        driver_id: pickString(payload, ["driver_id", "DriverID", "DriverId"]),
        driver_name: pickString(payload, ["driver_name", "DriverName"]),
        trips_completed: pickRaw(payload, ["trips_completed", "TripsCompleted", "Trips"]),
        total_revenue: pickRaw(payload, ["total_revenue", "TotalRevenue", "Revenue"]),
        incident_flags:
          typeof incidents === "string"
            ? incidents
                .split(/[,;|]/)
                .map((flag) => flag.trim())
                .filter(Boolean)
            : incidents,
        completed_at: pickRaw(payload, ["completed_at", "CompletedAt", "ShiftDate", "date"]),
        shift_id: pickString(payload, ["shift_id", "ShiftID", "id"]),
      };
      const data = parseOrThrow(shiftCompletedSchema, candidate);
      const incidentFlags = Array.isArray(data.incident_flags)
        ? data.incident_flags
        : (data.incident_flags ?? "")
            .split(/[,;|]/)
            .map((flag) => flag.trim())
            .filter(Boolean);
      return {
        kind: "shift",
        eventType,
        driverId: data.driver_id,
        driverName: data.driver_name ?? null,
        tripsCompleted: data.trips_completed,
        totalRevenue: Math.round(data.total_revenue * 100) / 100,
        incidentFlags,
        completedAt: data.completed_at ? parseIso(data.completed_at) : new Date().toISOString(),
        externalId: data.shift_id ?? `shift-${data.driver_id}-${parseIso(data.completed_at ?? new Date())}`,
      };
    }
  }
}

export const describeLocation = (location: NormalizedLocation): string =>
  location.raw || [location.line1, location.city, location.state].filter(Boolean).join(", ");

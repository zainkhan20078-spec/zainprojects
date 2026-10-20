/**
 * Demo event catalogue.
 *
 * Powers the console simulator and the integration test fixtures. Payloads are
 * byte-for-byte representative of what Limo Anywhere / Zapier deliver, including
 * PascalCase native fields and Zapier envelopes.
 */

export type DemoScenarioKey =
  | "quote-sedan"
  | "quote-sprinter"
  | "invoice-escalation"
  | "invoice-monitor"
  | "shift-completed"
  | "zapier-quote";

export type DemoScenario = {
  key: DemoScenarioKey;
  label: string;
  description: string;
  eventType: string;
  module: "A" | "B" | "ingest";
  build: () => Record<string, unknown>;
};

const uid = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const isoOffset = (hoursFromNow: number): string =>
  new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    key: "quote-sedan",
    label: "Quote · Executive Sedan · LAS arrival",
    description:
      "Quote.Requested from Terminal 3 to the Wynn. Guardrail reconciliation matches the dispatch fare, so Module A drafts a clean confirmation.",
    eventType: "Quote.Requested",
    module: "A",
    build: () => ({
      event_type: "Quote.Requested",
      event_id: `evt_quote_${uid()}`,
      payload: {
        passenger_name: "Mr. Marcus Whitcombe",
        passenger_email: "m.whitcombe@meridiancapital.example",
        passenger_phone: "+1 702 555 0188",
        pickup_datetime: isoOffset(30),
        pickup_location: {
          line1: "Harry Reid International Airport, Terminal 3",
          city: "Las Vegas",
          state: "NV",
          postal_code: "89119",
          airport_code: "LAS",
        },
        dropoff_location: {
          line1: "Wynn Las Vegas, 3131 S Las Vegas Blvd",
          city: "Las Vegas",
          state: "NV",
        },
        vehicle_type_requested: "Sedan",
        corporate_account_id: "CORP-1041",
        corporate_name: "Meridian Capital Partners",
        quoted_fare: 135.6,
        passengers: 2,
        flight_number: "DL1042",
        trip_type: "transfer",
      },
    }),
  },
  {
    key: "quote-sprinter",
    label: "Reservation · Executive Sprinter · Convention",
    description:
      "Reservation.Created for a board delegation at the Convention Center. The guardrail applies the published convention flat rate.",
    eventType: "Reservation.Created",
    module: "A",
    build: () => ({
      event_type: "Reservation.Created",
      event_id: `evt_res_${uid()}`,
      payload: {
        PassengerName: "Ms. Elena Vasquez",
        PassengerEmail: "e.vasquez@atlasindustrial.example",
        PickupDateTime: isoOffset(68),
        PickupAddress: "The Palazzo Tower, 3325 S Las Vegas Blvd, Las Vegas, NV",
        DropoffAddress: "Las Vegas Convention Center, West Hall",
        VehicleType: "Executive Sprinter",
        CorporateAccountID: "CORP-2088",
        CorporateName: "Atlas Industrial Holdings",
        QuotedFare: "334.50",
        PassengerCount: 9,
        TripType: "transfer",
        ReservationID: `RES-${uid().slice(0, 6).toUpperCase()}`,
      },
    }),
  },
  {
    key: "invoice-escalation",
    label: "Invoice · 47 days past due · escalate",
    description:
      "Invoice.PastDue beyond the 30-day threshold. Module B drafts the AR reminder and posts the priority card to #ar-alerts.",
    eventType: "Invoice.PastDue",
    module: "B",
    build: () => ({
      event_type: "Invoice.PastDue",
      event_id: `evt_inv_${uid()}`,
      payload: {
        billing_contact_email: "accounts.payable@redrockgaming.example",
        corporate_name: "Red Rock Gaming Group",
        invoice_number: `PSS-2026-${uid().slice(0, 4).toUpperCase()}`,
        balance_due: 8420.5,
        days_past_due: 47,
        due_date: isoOffset(-47 * 24),
        account_id: "CORP-3311",
        invoice_id: `INV-${uid()}`,
      },
    }),
  },
  {
    key: "invoice-monitor",
    label: "Invoice · 12 days past due · monitor",
    description:
      "Invoice.PastDue inside the grace window. The policy gate records the receivable and suppresses escalation.",
    eventType: "Invoice.PastDue",
    module: "ingest",
    build: () => ({
      event_type: "Invoice.PastDue",
      event_id: `evt_inv_${uid()}`,
      payload: {
        BillingContactEmail: "ap@summithospitality.example",
        CorporateName: "Summit Hospitality Trust",
        InvoiceNumber: `PSS-2026-${uid().slice(0, 4).toUpperCase()}`,
        BalanceDue: "1290.00",
        DaysPastDue: 12,
        AccountID: "CORP-4402",
        InvoiceID: `INV-${uid()}`,
      },
    }),
  },
  {
    key: "shift-completed",
    label: "Shift · completed with incident flags",
    description:
      "Shift.Completed for the overnight rotation. Ingested immediately and rolled into the next Module C audit batch.",
    eventType: "Shift.Completed",
    module: "ingest",
    build: () => ({
      event_type: "Shift.Completed",
      event_id: `evt_shift_${uid()}`,
      payload: {
        driver_id: "DRV-204",
        driver_name: "A. Delgado",
        trips_completed: 9,
        total_revenue: 1875.5,
        incident_flags: ["Late arrival — I-15 closure", "Guest left folio in vehicle"],
        completed_at: isoOffset(-3),
        shift_id: `SHIFT-${uid()}`,
      },
    }),
  },
  {
    key: "zapier-quote",
    label: "Quote · Zapier envelope · variance review",
    description:
      "Zapier-style `{ event, data, zap_meta }` wrapper. The dispatch fare deviates more than 5% so the draft is flagged for review.",
    eventType: "Quote.Requested",
    module: "A",
    build: () => ({
      event: "quote_requested",
      id: `zap_${uid()}`,
      zap_meta: { id: "zap-88213", attempt: 1, hook_id: "hook_ar_01" },
      data: {
        passenger_name: "Dr. Priya Raghavan",
        passenger_email: "p.raghavan@northstarhealth.example",
        pickup_datetime: isoOffset(52),
        pickup_location: "Bellagio Hotel & Casino, Las Vegas, NV",
        dropoff_location: "Harry Reid International Airport, Terminal 1",
        vehicle_type_requested: "VIP SUV",
        corporate_account_id: "CORP-5520",
        corporate_name: "Northstar Health Systems",
        quoted_fare: 165.0,
        passengers: 4,
        flight_number: "WN2214",
        trip_type: "transfer",
      },
    }),
  },
];

export const getScenario = (key: string): DemoScenario | undefined =>
  DEMO_SCENARIOS.find((scenario) => scenario.key === key);

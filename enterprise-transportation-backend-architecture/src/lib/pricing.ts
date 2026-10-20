/**
 * Deterministic pricing guardrails.
 *
 * Claude never computes a fare. This engine resolves a lane, applies the
 * configured vehicle-class rules and returns an itemized, auditable breakdown
 * that is injected into every prompt verbatim. If the Limo Anywhere quoted
 * fare diverges from the guardrail total by more than 5%, the draft is
 * downgraded to "pending dispatch review".
 */
import { db } from "@/db";
import { pricingRules } from "@/db/schema";
export type PricingRule = {
  vehicleClass: string;
  displayName: string;
  flatAirportRate: number;
  hourlyMinimum: number;
  hourlyRate: number;
  perMileRate: number;
  airportFee: number;
  fuelSurcharge: number;
  gratuityPct: number;
  passengerCapacity: number;
  baggageCapacity: number;
  notes: string;
};

/** Accepts either seed strings or Drizzle numeric strings (notes may be null). */
export type RawPricingRule = Omit<
  PricingRule,
  | "flatAirportRate"
  | "hourlyMinimum"
  | "hourlyRate"
  | "perMileRate"
  | "airportFee"
  | "fuelSurcharge"
  | "gratuityPct"
  | "notes"
> & {
  flatAirportRate: string | number;
  hourlyMinimum: string | number;
  hourlyRate: string | number;
  perMileRate: string | number;
  airportFee: string | number;
  fuelSurcharge: string | number;
  gratuityPct: string | number;
  notes?: string | null;
};

export type QuoteLine = { label: string; amount: number; detail: string };

export type QuoteBreakdown = {
  mode: "airport_flat" | "convention_flat" | "mileage" | "hourly";
  modeLabel: string;
  vehicleClass: string;
  vehicleName: string;
  distanceMiles: number;
  durationMinutes: number;
  currency: "USD";
  routeResolved: boolean;
  lines: QuoteLine[];
  subtotal: number;
  gratuity: number;
  total: number;
  fareSource: "limo_anywhere" | "guardrail_engine";
  dispatchFare: number | null;
  variance: number | null;
  variancePct: number | null;
  guardrail: "match" | "review";
  reviewReason: string | null;
  promptBlock: string;
};

export type QuoteInput = {
  pickupLocation: string;
  dropoffLocation: string;
  vehicleTypeRequested: string;
  tripType: string;
  quotedFare?: number | null;
  pickupDatetime?: Date | null;
  passengers?: number;
};

export const PRICING_FALLBACK: PricingRule[] = [];
const FALLBACK_NOTE = "Pricing rules table is empty; dispatch must confirm the fare.";

const toNum = (value: string | number): number =>
  typeof value === "number" ? value : Number.parseFloat(value);

export const normaliseRule = (rule: RawPricingRule): PricingRule => ({
  vehicleClass: rule.vehicleClass,
  displayName: rule.displayName,
  flatAirportRate: toNum(rule.flatAirportRate),
  hourlyMinimum: toNum(rule.hourlyMinimum),
  hourlyRate: toNum(rule.hourlyRate),
  perMileRate: toNum(rule.perMileRate),
  airportFee: toNum(rule.airportFee),
  fuelSurcharge: toNum(rule.fuelSurcharge),
  gratuityPct: toNum(rule.gratuityPct),
  passengerCapacity: rule.passengerCapacity,
  baggageCapacity: rule.baggageCapacity,
  notes: rule.notes ?? "",
});

/** Resolve the active rules from Postgres, with a resilient in-memory cache. */
let cachedRules: { at: number; rules: PricingRule[] } | null = null;

export async function getPricingRules(): Promise<PricingRule[]> {
  if (cachedRules && Date.now() - cachedRules.at < 30_000) return cachedRules.rules;
  const rows = await db.select().from(pricingRules);
  const rules = rows.filter((row) => row.isActive).map(normaliseRule);
  cachedRules = { at: Date.now(), rules };
  return rules;
}

export const routeCatalog: Array<{
  label: string;
  match: RegExp;
  miles: number;
  minutes: number;
}> = [
  { label: "Las Vegas Strip", match: /strip|bellagio|wynn|venetian|palazzo|aria|cosmopolitan|caesars|mgm|mandalay|resort world|planet hollywood|park mgm/i, miles: 3.5, minutes: 15 },
  { label: "Downtown Las Vegas", match: /downtown|fremont|circa|golden nugget|container park/i, miles: 11, minutes: 22 },
  { label: "Henderson", match: /henderson|green valley|lake mead/i, miles: 17, minutes: 28 },
  { label: "Summerlin", match: /summerlin|red rock|tpc/i, miles: 21, minutes: 32 },
  { label: "Lake Las Vegas", match: /lake las vegas/i, miles: 23, minutes: 34 },
  { label: "Las Vegas Convention Center", match: /convention center|lvcc|west hall|convention ctr/i, miles: 2.2, minutes: 12 },
];

const AIRPORT_PATTERN = /las|harry reid|mccarran|airport|terminal \d/i;

const isAirport = (value: string): boolean => AIRPORT_PATTERN.test(value);

const resolveLane = (pickup: string, dropoff: string) => {
  const pickupAirport = isAirport(pickup);
  const dropoffAirport = isAirport(dropoff);
  const dest = routeCatalog.find((lane) => lane.match.test(dropoff));
  const origin = routeCatalog.find((lane) => lane.match.test(pickup));
  const anchor = dest ?? origin;
  const airportInvolved = pickupAirport || dropoffAirport;
  const resolved = Boolean(anchor) || airportInvolved;
  return {
    airportInvolved,
    resolved,
    label: anchor?.label ?? (airportInvolved ? "Airport transfer" : "Unresolved route"),
    miles: anchor?.miles ?? (airportInvolved ? 8 : 12),
    minutes: anchor?.minutes ?? (airportInvolved ? 20 : 26),
    convention: /convention center|lvcc|west hall|expo/i.test(pickup) || /convention center|lvcc|west hall|expo/i.test(dropoff),
  };
};

const money = (value: number): number => Math.round(value * 100) / 100;
const usd = (value: number): string => `$${money(value).toFixed(2)}`;

const matchRule = (rules: PricingRule[], vehicleClass: string): PricingRule | null => {
  const needle = vehicleClass.toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    sedan: "sedan",
    executive_sedan: "sedan",
    luxury_sedan: "sedan",
    suv: "vip_suv",
    vip_suv: "vip_suv",
    luxury_suv: "vip_suv",
    escalade: "vip_suv",
    suburban: "vip_suv",
    sprinter: "executive_sprinter",
    executive_sprinter: "executive_sprinter",
    van: "executive_sprinter",
  };
  const canonical = aliases[needle] ?? needle;
  return (
    rules.find((rule) => rule.vehicleClass === canonical) ??
    rules.find((rule) => needle.includes(rule.vehicleClass)) ??
    rules[0] ??
    null
  );
};

/**
 * Calculate an itemized quote. When no rule matches (empty table) the function
 * returns a zeroed, explicitly flagged breakdown rather than guessing a price.
 */
export function calculateQuote(input: QuoteInput, rules: PricingRule[]): QuoteBreakdown {
  const rule = matchRule(rules, input.vehicleTypeRequested);
  const lane = resolveLane(input.pickupLocation, input.dropoffLocation);
  const dispatchFare =
    typeof input.quotedFare === "number" && Number.isFinite(input.quotedFare) ? money(input.quotedFare) : null;

  if (!rule) {
    const total = dispatchFare ?? 0;
    return {
      mode: "mileage",
      modeLabel: "Mileage billing",
      vehicleClass: input.vehicleTypeRequested,
      vehicleName: input.vehicleTypeRequested,
      distanceMiles: lane.miles,
      durationMinutes: lane.minutes,
      currency: "USD",
      routeResolved: lane.resolved,
      lines: [{ label: "Base rate", amount: total, detail: FALLBACK_NOTE }],
      subtotal: total,
      gratuity: 0,
      total,
      fareSource: dispatchFare === null ? "guardrail_engine" : "limo_anywhere",
      dispatchFare,
      variance: null,
      variancePct: null,
      guardrail: "review",
      reviewReason: FALLBACK_NOTE,
      promptBlock: `<pricing_guardrail status="unresolved">No active vehicle-class rule found. Do not state a total; note that dispatch will confirm the fare.</pricing_guardrail>`,
    };
  }

  const tripType = input.tripType.toLowerCase();
  const hourly = /hour|disposal|as.?directed/.test(tripType);
  const requestedHours = Number(input.tripType.match(/(\d+)\s*-?\s*hour/i)?.[1] ?? 0);

  let mode: QuoteBreakdown["mode"];
  let modeLabel: string;
  let baseAmount: number;
  const lines: QuoteLine[] = [];

  if (hourly) {
    mode = "hourly";
    modeLabel = "Hourly disposal";
    const hours = requestedHours > 0 ? requestedHours : rule.hourlyMinimum / rule.hourlyRate;
    baseAmount = money(Math.max(rule.hourlyMinimum, hours * rule.hourlyRate));
    lines.push({
      label: `Hourly service (${hours.toFixed(1)} hours)`,
      amount: baseAmount,
      detail: `Hourly rate ${usd(rule.hourlyRate)}; minimum ${usd(rule.hourlyMinimum)}.`,
    });
  } else if (lane.airportInvolved) {
    mode = "airport_flat";
    modeLabel = "LAS airport flat rate";
    baseAmount = rule.flatAirportRate;
    lines.push({
      label: `Airport flat rate — ${rule.displayName}`,
      amount: baseAmount,
      detail: `${lane.label}; approximately ${lane.miles} statute miles / ${lane.minutes} minutes.`,
    });
  } else if (lane.convention) {
    mode = "convention_flat";
    modeLabel = "Convention flat rate";
    baseAmount = money(rule.flatAirportRate * 1.25);
    lines.push({
      label: `Convention flat rate — ${rule.displayName}`,
      amount: baseAmount,
      detail: "Published event window required; gratuity itemized separately.",
    });
  } else {
    mode = "mileage";
    modeLabel = "Mileage billing";
    baseAmount = money(Math.max(lane.miles * rule.perMileRate, rule.perMileRate * 10));
    lines.push({
      label: `Mileage (${lane.miles} miles)`,
      amount: baseAmount,
      detail: `${usd(rule.perMileRate)} per mile; 10-mile minimum applied.`,
    });
  }

  const airportFee = lane.airportInvolved ? rule.airportFee : 0;
  if (airportFee > 0) {
    lines.push({ label: "LAS airport fee", amount: airportFee, detail: "Airport access and terminal holding." });
  }
  lines.push({ label: "Fuel surcharge", amount: rule.fuelSurcharge, detail: "Fixed per-trip surcharge." });

  const subtotal = money(baseAmount + airportFee + rule.fuelSurcharge);
  const gratuity = money((subtotal * rule.gratuityPct) / 100);
  lines.push({
    label: `Gratuity (${rule.gratuityPct.toFixed(0)}%)`,
    amount: gratuity,
    detail: "Itemized chauffeur gratuity.",
  });
  const total = money(subtotal + gratuity);

  let variance: number | null = null;
  let variancePct: number | null = null;
  if (dispatchFare !== null) {
    variance = money(dispatchFare - total);
    variancePct = total === 0 ? null : money((variance / total) * 100);
  }

  const reviewReasons: string[] = [];
  if (dispatchFare === null) reviewReasons.push("No Limo Anywhere fare supplied; guardrail total stands as an estimate only.");
  if (variancePct !== null && Math.abs(variancePct) > 5) reviewReasons.push(`Dispatch fare differs from the guardrail total by ${variancePct.toFixed(2)}% (tolerance 5%).`);
  if (!lane.resolved) reviewReasons.push("Route could not be resolved to a known lane; distance is estimated.");
  const guardrail: QuoteBreakdown["guardrail"] = reviewReasons.length > 0 ? "review" : "match";

  const promptBlock = [
    `<pricing_guardrail source="${dispatchFare === null ? "engine" : "limo_anywhere+engine"}" status="${guardrail}">`,
    `  <mode>${modeLabel}</mode>`,
    `  <vehicle_class>${rule.displayName}</vehicle_class>`,
    `  <route>${input.pickupLocation} → ${input.dropoffLocation} (${lane.miles} miles, ${lane.minutes} minutes)</route>`,
    ...lines.map((line) => `  <line label="${line.label}" amount="${usd(line.amount)}" />`),
    `  <total currency="USD">${usd(total)}</total>`,
    dispatchFare !== null ? `  <dispatch_fare>${usd(dispatchFare)}</dispatch_fare>` : "",
    variance !== null ? `  <variance>${variance >= 0 ? "+" : ""}${usd(variance)}</variance>` : "",
    reviewReasons.length > 0
      ? `  <review_required>${reviewReasons.join(" ")}</review_required>`
      : "  <review_required>false</review_required>",
    "  <rule>Use these amounts verbatim. Do not add, round, discount or invent any charge.</rule>",
    "</pricing_guardrail>",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    mode,
    modeLabel,
    vehicleClass: rule.vehicleClass,
    vehicleName: rule.displayName,
    distanceMiles: lane.miles,
    durationMinutes: lane.minutes,
    currency: "USD",
    routeResolved: lane.resolved,
    lines,
    subtotal,
    gratuity,
    total,
    fareSource: dispatchFare === null ? "guardrail_engine" : "limo_anywhere",
    dispatchFare,
    variance,
    variancePct,
    guardrail,
    reviewReason: reviewReasons.length > 0 ? reviewReasons.join(" ") : null,
    promptBlock,
  };
}

/** Formatted, human-readable breakdown used by the console and email previews. */
export function formatQuoteLines(breakdown: QuoteBreakdown): string[] {
  return breakdown.lines.map((line) => `${line.label}: ${usd(line.amount)}`);
}

export const formatUsd = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = typeof value === "string" ? Number.parseFloat(value) : value;
  return Number.isFinite(numeric) ? usd(numeric) : "—";
};

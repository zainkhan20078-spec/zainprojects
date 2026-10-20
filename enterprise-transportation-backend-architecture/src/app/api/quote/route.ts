/**
 * GET  /api/quote — active pricing guardrail rules.
 * POST /api/quote — deterministic quote calculation (no AI, no side effects).
 *
 * This is the same engine whose output is injected into Claude prompts, so the
 * endpoint doubles as a reconciliation tool for dispatch.
 */
import { z } from "zod";
import { ok } from "@/lib/api";
import { calculateQuote, getPricingRules } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const quoteSchema = z.object({
  pickupLocation: z.string().trim().min(2),
  dropoffLocation: z.string().trim().min(2),
  vehicleType: z.string().trim().min(2),
  tripType: z.string().trim().default("transfer"),
  quotedFare: z.coerce.number().min(0).optional(),
  passengers: z.coerce.number().int().min(1).max(24).optional(),
});

export async function GET(): Promise<Response> {
  const rules = await getPricingRules();
  return ok({ ok: true, currency: "USD", rules });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ok({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return ok(
      {
        ok: false,
        error: "invalid_payload",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      422,
    );
  }

  const rules = await getPricingRules();
  const breakdown = calculateQuote(
    {
      pickupLocation: parsed.data.pickupLocation,
      dropoffLocation: parsed.data.dropoffLocation,
      vehicleTypeRequested: parsed.data.vehicleType,
      tripType: parsed.data.tripType,
      quotedFare: parsed.data.quotedFare ?? null,
      passengers: parsed.data.passengers,
    },
    rules,
  );

  return ok({ ok: true, breakdown });
}

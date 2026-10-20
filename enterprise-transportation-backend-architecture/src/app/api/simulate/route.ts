/**
 * POST /api/simulate
 *
 * Runs a representative provider payload through the exact production pipeline
 * (signature bypassed and recorded as `simulated`). Used by the console's Demo
 * Delivery panel and by integration smoke tests.
 */
import { fail, ok, readJson } from "@/lib/api";
import { DEMO_SCENARIOS, getScenario } from "@/lib/demo";
import { ingestWebhook } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return ok({
    ok: true,
    scenarios: DEMO_SCENARIOS.map(({ key, label, description, eventType, module }) => ({
      key,
      label,
      description,
      eventType,
      module,
    })),
  });
}

export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  const key = typeof body?.scenario === "string" ? body.scenario : "quote-sedan";
  const scenario = getScenario(key);

  if (!scenario) {
    return fail("unknown_scenario", `Unknown scenario "${key}".`, 404, {
      scenarios: DEMO_SCENARIOS.map((item) => item.key),
    });
  }

  const payload = scenario.build();
  const result = await ingestWebhook({
    rawBody: JSON.stringify(payload),
    headers: new Headers({ "content-type": "application/json", "x-pss-simulated": "true" }),
    transport: "simulator",
  });

  return Response.json(
    { ...result.body, scenario: scenario.key, scenarioLabel: scenario.label },
    { status: result.httpStatus, headers: { "Cache-Control": "no-store" } },
  );
}

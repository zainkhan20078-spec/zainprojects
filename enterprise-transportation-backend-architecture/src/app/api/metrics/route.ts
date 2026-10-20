/** GET /api/metrics — operations KPIs and integration readiness. */
import { ok } from "@/lib/api";
import { getDashboardMetrics } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const metrics = await getDashboardMetrics();
  return ok({ ok: true, metrics, generatedAt: new Date().toISOString() });
}

/** GET /api/runs — workflow execution ledger. */
import { ok } from "@/lib/api";
import { listRuns } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 40), 1), 200);
  const runs = await listRuns(limit);
  return ok({ ok: true, count: runs.length, runs });
}

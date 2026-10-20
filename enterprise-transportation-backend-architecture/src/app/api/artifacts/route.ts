/** GET /api/artifacts — Gmail drafts, Slack messages and Sheets rows produced by the orchestrator. */
import { ok } from "@/lib/api";
import { listArtifacts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 60), 1), 200);
  const kind = url.searchParams.get("kind");
  const rows = await listArtifacts(limit);
  const filtered = kind ? rows.filter((row) => row.kind === kind) : rows;
  return ok({ ok: true, count: filtered.length, artifacts: filtered });
}

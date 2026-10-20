/** GET /api/events — recent webhook deliveries with normalized routing state. */
import { ok } from "@/lib/api";
import { listEvents } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 40), 1), 200);
  const events = await listEvents(limit);
  return ok({ ok: true, count: events.length, events });
}

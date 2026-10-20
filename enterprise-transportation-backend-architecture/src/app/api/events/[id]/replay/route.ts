/**
 * POST /api/events/:id/replay
 *
 * Re-processes a persisted event. A new event id is minted (`-replay-<ts>`) so the
 * replay is separately auditable and cannot collide with the idempotency key of
 * the original delivery.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { ingestWebhook } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, id)).limit(1);

  if (!event) return fail("not_found", "Event not found.", 404);

  const payload = event.payload as Record<string, unknown>;
  const replayBody = {
    ...payload,
    event_type: payload.event_type ?? event.eventType,
    event_id: `${event.eventId}-replay-${Date.now()}`,
  };

  const result = await ingestWebhook({
    rawBody: JSON.stringify(replayBody),
    headers: new Headers({ "content-type": "application/json", "x-pss-replay": event.id }),
    transport: "simulator",
  });

  return Response.json(
    { ...result.body, replayOf: event.id, originalEventId: event.eventId },
    { status: result.httpStatus, headers: { "Cache-Control": "no-store" } },
  );
}

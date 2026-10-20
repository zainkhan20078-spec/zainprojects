/**
 * POST /api/webhooks/limo-anywhere
 *
 * Limo Anywhere webhook consumer (native payloads or Zapier webhook wrappers).
 * Responds 202 once the event is durably persisted and routed, 200 for
 * idempotent duplicates, 401 for bad HMAC signatures, 422 for schema failures.
 */
import { fail, ok } from "@/lib/api";
import { INTEGRATION_STATUS } from "@/lib/config";
import { CANONICAL_EVENT_TYPES } from "@/lib/events";
import { ingestWebhook } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 512 * 1024;

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();

  if (rawBody.length > MAX_BODY_BYTES) {
    return fail("payload_too_large", "Webhook payload exceeds the 512 KB limit.", 413);
  }
  if (rawBody.trim() === "") {
    return fail("empty_body", "Request body is empty. Include the Limo Anywhere JSON payload.", 400);
  }

  try {
    const result = await ingestWebhook({ rawBody, headers: request.headers });
    return Response.json(result.body, {
      status: result.httpStatus,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[webhook] unhandled ingestion error", error);
    return fail(
      "ingestion_failure",
      error instanceof Error ? error.message : "Unexpected ingestion failure.",
      500,
    );
  }
}

export async function GET(): Promise<Response> {
  return ok({
    ok: true,
    endpoint: "/api/webhooks/limo-anywhere",
    method: "POST",
    supportedEvents: CANONICAL_EVENT_TYPES,
    transports: ["native", "zapier"],
    signature: INTEGRATION_STATUS.limoAnywhereSignature
      ? "HMAC-SHA256 enforced (x-limo-anywhere-signature, x-webhook-signature or x-hub-signature-256)."
      : "No LIMO_ANYWHERE_WEBHOOK_SECRET configured — signatures are recorded as unverified.",
    idempotency: "Unique constraint on (source, event_id). Re-deliveries return 200 with the original event row.",
    routing: {
      "Quote.Requested": "Module A — instant luxury quote drafting",
      "Reservation.Created": "Module A — instant luxury quote drafting",
      "Invoice.PastDue": "AR monitor, then Module B once past the 30-day threshold",
      "Shift.Completed": "Shift ingestion for the next Module C audit",
    },
  });
}

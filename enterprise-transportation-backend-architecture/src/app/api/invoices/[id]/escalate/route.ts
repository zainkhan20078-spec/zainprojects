/**
 * POST /api/invoices/:id/escalate
 *
 * Manual controller-initiated escalation. Runs Module B immediately for a single
 * receivable. The policy gate still applies: invoices inside the grace window are
 * logged as skipped rather than escalated.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { runModuleB } from "@/lib/workflows/module-b";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!invoice) return fail("not_found", "Invoice not found.", 404);

  try {
    const result = await runModuleB({
      providerEventId: `manual-ar-${invoice.invoiceNumber}-${Date.now()}`,
      invoice,
      relationshipYears: Math.max(1, new Date().getFullYear() - 2000),
      trigger: "manual",
    });
    return ok({ ok: true, ...result });
  } catch (error) {
    return fail(
      "escalation_failed",
      error instanceof Error ? error.message : "Escalation failed.",
      500,
    );
  }
}

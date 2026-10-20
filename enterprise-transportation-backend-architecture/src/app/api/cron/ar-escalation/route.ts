/**
 * GET|POST /api/cron/ar-escalation
 *
 * Scheduled accounts receivable sweep. Selects every open receivable beyond the
 * escalation threshold and runs Module B. Safe to call repeatedly: escalated
 * invoices are excluded and re-delivery is idempotent.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (open when CRON_SECRET is unset).
 */
import { and, desc, eq, gt, ne } from "drizzle-orm";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { authorizeCron, ok } from "@/lib/api";
import { WORKFLOW_CONFIG } from "@/lib/config";
import { runModuleB } from "@/lib/workflows/module-b";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function sweep(): Promise<Response> {
  const threshold = WORKFLOW_CONFIG.arEscalationDays;
  const due = await db
    .select()
    .from(invoices)
    .where(
      and(
        gt(invoices.daysPastDue, threshold),
        ne(invoices.status, "escalated"),
        ne(invoices.status, "resolved"),
      ),
    )
    .orderBy(desc(invoices.daysPastDue))
    .limit(10);

  const results: Array<Record<string, unknown>> = [];
  for (const invoice of due) {
    try {
      const result = await runModuleB({
        providerEventId: `cron-ar-${invoice.invoiceNumber}-${new Date().toISOString().slice(0, 10)}`,
        invoice,
        relationshipYears: Math.max(1, new Date().getFullYear() - 2000),
        trigger: "cron",
      });
      results.push({
        invoiceNumber: invoice.invoiceNumber,
        corporateName: invoice.corporateName,
        status: result.status,
        runId: result.runId,
        summary: result.summary,
      });
    } catch (error) {
      results.push({
        invoiceNumber: invoice.invoiceNumber,
        corporateName: invoice.corporateName,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return ok({
    ok: true,
    job: "ar-escalation",
    thresholdDays: threshold,
    scanned: due.length,
    escalated: results.filter((item) => item.status === "succeeded").length,
    results,
  });
}

export async function GET(request: Request): Promise<Response> {
  const auth = authorizeCron(request);
  if (!auth.ok) return auth.response;
  return sweep();
}

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeCron(request);
  if (!auth.ok) return auth.response;
  return sweep();
}

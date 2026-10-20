/**
 * GET|POST /api/cron/daily-audit
 *
 * Scheduled Module C execution: aggregates the trailing 24 hours of inquiries,
 * phone transcripts, completed shifts and automation telemetry, then writes the
 * Claude audit to Google Sheets and Slack.
 */
import { authorizeCron } from "@/lib/api";
import { fail, ok } from "@/lib/api";
import { buildDispatchBatch, runModuleC } from "@/lib/workflows/module-c";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

async function run(): Promise<Response> {
  try {
    const batch = await buildDispatchBatch();
    const result = await runModuleC({ trigger: "cron", batch });
    return ok({
      ok: true,
      job: "daily-audit",
      runId: result.runId,
      mode: result.mode,
      summary: result.summary,
      kpis: result.audit.kpis,
      anomalies: result.audit.anomalies,
      batch: {
        inquiries: batch.inquiries.length,
        transcripts: batch.phone_transcripts.length,
        shifts: batch.shifts.length,
      },
    });
  } catch (error) {
    return fail(
      "audit_failed",
      error instanceof Error ? error.message : "Daily audit failed.",
      500,
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  const auth = authorizeCron(request);
  if (!auth.ok) return auth.response;
  return run();
}

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeCron(request);
  if (!auth.ok) return auth.response;
  return run();
}

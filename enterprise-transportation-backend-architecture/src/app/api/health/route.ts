import { sql } from "drizzle-orm";
import { db } from "@/db";
import { INTEGRATION_STATUS } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * Liveness + dependency readiness. Returns 200 only when Postgres answers.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json(
      {
        ok: true,
        service: "personal-sedan-automation",
        database: "reachable",
        integrations: INTEGRATION_STATUS,
        timestamp: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ ok: false, database: "unreachable" }, { status: 500 });
  }
}

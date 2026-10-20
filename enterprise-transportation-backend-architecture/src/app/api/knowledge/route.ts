/**
 * GET  /api/knowledge — Claude Project knowledge artifacts + pricing guardrails.
 * PUT  /api/knowledge — update an artifact's XML (versioned, never destructive).
 */
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { knowledgeDocuments } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/api";
import { listKnowledge, listPricingRules } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const updateSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  xmlContent: z.string().trim().min(40).max(200_000),
});

export async function GET(): Promise<Response> {
  const [documents, rules] = await Promise.all([listKnowledge(), listPricingRules()]);
  return ok({ ok: true, documents, pricingRules: rules });
}

export async function PUT(request: Request): Promise<Response> {
  const body = await readJson(request);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return fail("invalid_payload", "slug and xmlContent are required.", 422, {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const [updated] = await db
    .update(knowledgeDocuments)
    .set({
      xmlContent: parsed.data.xmlContent,
      version: sql`${knowledgeDocuments.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeDocuments.slug, parsed.data.slug))
    .returning();

  if (!updated) return fail("not_found", `No knowledge artifact with slug "${parsed.data.slug}".`, 404);
  return ok({ ok: true, document: updated });
}

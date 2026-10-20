/**
 * Small HTTP helpers shared by route handlers.
 */
import { NextResponse } from "next/server";
import { WORKFLOW_CONFIG } from "@/lib/config";

export const noStore = { "Cache-Control": "no-store" } as const;

export const ok = (body: unknown, status = 200): NextResponse =>
  NextResponse.json(body, { status, headers: noStore });

export const fail = (error: string, message: string, status = 400, extra?: Record<string, unknown>): NextResponse =>
  NextResponse.json({ ok: false, error, message, ...extra }, { status, headers: noStore });

export const readJson = async (request: Request): Promise<Record<string, unknown> | null> => {
  try {
    const value = (await request.json()) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

export type CronAuth = { ok: true } | { ok: false; response: NextResponse };

/** Bearer or query-secret auth for scheduled invocations. */
export function authorizeCron(request: Request): CronAuth {
  const secret = WORKFLOW_CONFIG.cronSecret;
  if (!secret) return { ok: true };

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  const provided = bearer || request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret") || "";
  if (provided === secret) return { ok: true };
  return {
    ok: false,
    response: fail("unauthorized", "Provide `Authorization: Bearer <CRON_SECRET>`.", 401),
  };
}

/**
 * Artefact persistence.
 *
 * Every draft, Slack message and Sheets row is written to Postgres so operators
 * can audit exactly what the orchestrator produced, regardless of whether the
 * delivery adapter ran live or simulated.
 */
import { db } from "@/db";
import { artifacts } from "@/db/schema";

export type ArtifactKind = "gmail_draft" | "slack_message" | "sheets_row";
export type ArtifactRecord = typeof artifacts.$inferSelect;

export const getAppUrl = (): string =>
  (process.env.PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );

/** Relative deep link used inside the console. */
export const artifactPath = (id: string): string => `/outbox?artifact=${id}`;

/** Absolute deep link used in Slack buttons. */
export const artifactUrl = (id: string): string => `${getAppUrl()}${artifactPath(id)}`;

export async function recordArtifact(input: {
  runId: string | null;
  kind: ArtifactKind;
  provider: "google" | "slack";
  target: string;
  title: string;
  body: string;
  reference: string;
  url: string | null;
  mode: "live" | "simulated";
  metadata?: Record<string, unknown>;
}): Promise<ArtifactRecord> {
  const [row] = await db
    .insert(artifacts)
    .values({
      runId: input.runId,
      kind: input.kind,
      provider: input.provider,
      target: input.target,
      title: input.title,
      body: input.body,
      reference: input.reference,
      url: input.url,
      mode: input.mode,
      metadata: input.metadata ?? {},
    })
    .returning();
  return row;
}

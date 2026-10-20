/**
 * Google Workspace delivery adapters.
 *
 * Auth model: a service account with domain-wide delegation impersonating a
 * Workspace user (GOOGLE_IMPERSONATED_USER). Scopes are intentionally minimal:
 *   - gmail.compose          (create drafts only — the orchestrator never sends)
 *   - spreadsheets           (append the daily audit row)
 *
 * If credentials are absent the adapter returns a `simulated` delivery result so
 * the workflow, its artefacts and the console remain fully functional. Nothing
 * is ever silently sent: this module has no send call at all.
 */
import { JWT } from "google-auth-library";
import { gmail } from "@googleapis/gmail";
import { sheets } from "@googleapis/sheets";
import { GOOGLE_CONFIG } from "@/lib/config";

export type DeliveryMode = "live" | "simulated";

export type DeliveryResult = {
  mode: DeliveryMode;
  reference: string;
  url: string | null;
  target: string;
};

export class GoogleIntegrationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "GoogleIntegrationError";
  }
}

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.compose"];
const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export const isGoogleConfigured = (): boolean =>
  Boolean(GOOGLE_CONFIG.clientEmail && GOOGLE_CONFIG.privateKey && GOOGLE_CONFIG.impersonatedUser);

export const isSheetsConfigured = (): boolean => isGoogleConfigured() && Boolean(GOOGLE_CONFIG.sheetId);

const buildAuth = (scopes: string[]): JWT =>
  new JWT({
    email: GOOGLE_CONFIG.clientEmail,
    key: GOOGLE_CONFIG.privateKey,
    scopes,
    subject: GOOGLE_CONFIG.impersonatedUser,
  });

const base64Url = (input: string): string =>
  Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const encodeHeader = (value: string): string =>
  /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;

/** RFC 5322 plain-text message used for the Gmail draft. */
export function buildMimeMessage(input: {
  to: string;
  subject: string;
  body: string;
  from?: string;
  cc?: string;
}): string {
  const headers = [
    `From: ${input.from ?? GOOGLE_CONFIG.impersonatedUser}`,
    `To: ${input.to}`,
    input.cc ? `Cc: ${input.cc}` : "",
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "X-PSS-Origin: claude-orchestrator",
    "X-PSS-Status: draft-for-human-review",
  ].filter(Boolean);

  return `${headers.join("\r\n")}\r\n\r\n${input.body.replace(/\r?\n/g, "\r\n")}`;
}

/**
 * Create a Gmail DRAFT (never a sent message) in the dispatch team's mailbox.
 */
export async function createGmailDraft(input: {
  to: string;
  subject: string;
  body: string;
  from?: string;
  cc?: string;
}): Promise<DeliveryResult> {
  const target = "gmail:drafts";

  if (!isGoogleConfigured()) {
    return {
      mode: "simulated",
      reference: `sim-gmail-draft-${Date.now().toString(36)}`,
      url: null,
      target,
    };
  }

  try {
    const auth = buildAuth(GMAIL_SCOPES);
    const gmailClient = gmail({ version: "v1", auth });
    const raw = base64Url(
      buildMimeMessage({
        to: input.to,
        subject: input.subject,
        body: input.body,
        from: input.from ?? GOOGLE_CONFIG.impersonatedUser,
        cc: input.cc,
      }),
    );

    const response = await gmailClient.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw } },
    });

    const draftId = response.data.id ?? "unknown-draft";
    return {
      mode: "live",
      reference: draftId,
      url: `https://mail.google.com/mail/u/0/#drafts?compose=${draftId}`,
      target,
    };
  } catch (error) {
    throw new GoogleIntegrationError(
      `Gmail draft creation failed: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}

/**
 * Append the structured daily audit as a single row in the configured Sheet.
 * Columns are fixed so Looker Studio / Sheets formulas remain stable.
 */
export async function appendAuditRow(values: string[]): Promise<DeliveryResult> {
  const target = GOOGLE_CONFIG.auditSheetTab;

  if (!isSheetsConfigured()) {
    return {
      mode: "simulated",
      reference: `sim-sheets-row-${Date.now().toString(36)}`,
      url: null,
      target,
    };
  }

  try {
    const auth = buildAuth(SHEETS_SCOPES);
    const sheetsClient = sheets({ version: "v4", auth });
    const response = await sheetsClient.spreadsheets.values.append({
      spreadsheetId: GOOGLE_CONFIG.sheetId,
      range: `'${GOOGLE_CONFIG.auditSheetTab}'!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [values] },
    });

    const updatedRange = response.data.updates?.updatedRange ?? "unknown-range";
    return {
      mode: "live",
      reference: updatedRange,
      url: `https://docs.google.com/spreadsheets/d/${GOOGLE_CONFIG.sheetId}`,
      target,
    };
  } catch (error) {
    throw new GoogleIntegrationError(
      `Google Sheets append failed: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}

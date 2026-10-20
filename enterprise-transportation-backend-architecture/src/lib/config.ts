/**
 * Centralised runtime configuration.
 *
 * Nothing here throws at import time: the console, seeded demo pipeline and
 * simulated delivery adapters must work in environments where third-party
 * credentials have not yet been provisioned. Each integration reports its own
 * readiness so the UI can display LIVE vs SIMULATED truthfully.
 */

const str = (key: string, fallback = ""): string => {
  const value = process.env[key];
  return value === undefined || value === null || value.trim() === "" ? fallback : value.trim();
};

const num = (key: string, fallback: number): number => {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const BRAND = {
  name: "Personal Sedan Services",
  shortName: "Personal Sedan",
  established: 2000,
  base: "Las Vegas, Nevada",
  reservationsEmail: str("RESERVATIONS_FROM_EMAIL", "reservations@personalsedanservices.com"),
  dispatchEmail: str("DISPATCH_DRAFT_TO", "dispatch@personalsedanservices.com"),
  phone: str("RESERVATIONS_PHONE", "(702) 555-0140"),
  timezone: str("OPERATIONS_TIMEZONE", "America/Los_Angeles"),
} as const;

export const LA_CONFIG = {
  webhookSecret: str("LIMO_ANYWHERE_WEBHOOK_SECRET"),
  apiBaseUrl: str("LIMO_ANYWHERE_API_BASE_URL", "https://api.limoanywhere.com"),
  apiKey: str("LIMO_ANYWHERE_API_KEY"),
} as const;

export const ANTHROPIC_CONFIG = {
  apiKey: str("ANTHROPIC_API_KEY"),
  model: str("ANTHROPIC_MODEL", "claude-sonnet-4-5"),
  maxTokens: num("CLAUDE_MAX_TOKENS", 1600),
  timeoutMs: num("CLAUDE_TIMEOUT_MS", 45_000),
  maxRetries: num("CLAUDE_MAX_RETRIES", 3),
  baseBackoffMs: num("CLAUDE_BASE_BACKOFF_MS", 900),
  maxBackoffMs: num("CLAUDE_MAX_BACKOFF_MS", 20_000),
} as const;

export const GOOGLE_CONFIG = {
  clientEmail: str("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
  privateKey: str("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  impersonatedUser: str("GOOGLE_IMPERSONATED_USER"),
  sheetId: str("GOOGLE_SHEET_ID"),
  auditSheetTab: str("GOOGLE_SHEETS_AUDIT_TAB", "Daily Dispatch Audit"),
} as const;

export const SLACK_CONFIG = {
  arWebhookUrl: str("SLACK_AR_WEBHOOK_URL") || str("SLACK_WEBHOOK_URL"),
  dispatchWebhookUrl:
    str("SLACK_DISPATCH_WEBHOOK_URL") || str("SLACK_WEBHOOK_URL"),
  arChannel: str("SLACK_AR_CHANNEL", "#ar-alerts"),
  dispatchChannel: str("SLACK_DISPATCH_CHANNEL", "#daily-dispatch-log"),
} as const;

export const WORKFLOW_CONFIG = {
  arEscalationDays: num("AR_ESCALATION_DAYS", 30),
  cronSecret: str("CRON_SECRET"),
  draftSenderName: str("GMAIL_DRAFT_SENDER_NAME", "Personal Sedan Services Reservations"),
  gmailUserId: str("GMAIL_USER_ID", "me"),
  auditLookbackHours: num("AUDIT_LOOKBACK_HOURS", 24),
} as const;

export const INTEGRATION_STATUS = {
  anthropic: Boolean(ANTHROPIC_CONFIG.apiKey),
  google: Boolean(
    GOOGLE_CONFIG.clientEmail && GOOGLE_CONFIG.privateKey && GOOGLE_CONFIG.impersonatedUser,
  ),
  sheets: Boolean(
    GOOGLE_CONFIG.clientEmail &&
      GOOGLE_CONFIG.privateKey &&
      GOOGLE_CONFIG.impersonatedUser &&
      GOOGLE_CONFIG.sheetId,
  ),
  slackAr: Boolean(SLACK_CONFIG.arWebhookUrl),
  slackDispatch: Boolean(SLACK_CONFIG.dispatchWebhookUrl),
  limoAnywhereSignature: Boolean(LA_CONFIG.webhookSecret),
} as const;

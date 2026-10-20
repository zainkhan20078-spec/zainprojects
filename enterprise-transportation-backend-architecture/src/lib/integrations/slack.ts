/**
 * Slack delivery adapter.
 *
 * Two logical channels are used:
 *   - #ar-alerts           (accounts receivable escalation, Module B)
 *   - #daily-dispatch-log  (executive dispatch audit, Module C)
 *
 * Incoming webhooks are used so no bot token is required. Requests are timeout
 * bounded, retried once on transport failure, and validated against Slack's
 * plain-text `ok` response.
 */
import { SLACK_CONFIG } from "@/lib/config";

export type SlackDelivery = {
  mode: "live" | "simulated";
  reference: string;
  channel: string;
  url: string | null;
};

export class SlackIntegrationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "SlackIntegrationError";
  }
}

export type SlackBlock = Record<string, unknown>;

type SlackTarget = "ar" | "dispatch";

const resolveWebhook = (target: SlackTarget): string =>
  target === "ar" ? SLACK_CONFIG.arWebhookUrl : SLACK_CONFIG.dispatchWebhookUrl;

export const resolveChannel = (target: SlackTarget): string =>
  target === "ar" ? SLACK_CONFIG.arChannel : SLACK_CONFIG.dispatchChannel;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function postOnce(
  webhookUrl: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  return fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
}

export async function postSlackMessage(input: {
  target: SlackTarget;
  text: string;
  blocks?: SlackBlock[];
}): Promise<SlackDelivery> {
  const channel = resolveChannel(input.target);
  const webhookUrl = resolveWebhook(input.target);

  if (!webhookUrl) {
    return {
      mode: "simulated",
      reference: `sim-slack-${Date.now().toString(36)}`,
      channel,
      url: null,
    };
  }

  const payload: Record<string, unknown> = {
    channel,
    text: input.text,
    username: "PSS Automation",
    icon_emoji: ":black_sedan:",
    ...(input.blocks && input.blocks.length > 0 ? { blocks: input.blocks } : {}),
  };

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await postOnce(webhookUrl, payload);
      if (!response.ok) {
        throw new Error(`Slack webhook returned HTTP ${response.status}`);
      }
      const body = (await response.text()).trim();
      if (body && body !== "ok") {
        throw new Error(`Slack webhook rejected payload: ${body}`);
      }
      return {
        mode: "live",
        reference: `slack-${channel.replace("#", "")}-${Date.now().toString(36)}`,
        channel,
        url: null,
      };
    } catch (error) {
      lastError = error;
      if (attempt === 0) await sleep(400);
    }
  }

  throw new SlackIntegrationError(
    `Slack delivery to ${channel} failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    lastError,
  );
}

/** Executive summary card for #daily-dispatch-log. */
export function buildDispatchAuditBlocks(input: {
  auditDate: string;
  totalTrips: number;
  revenue: string;
  toneScore: string;
  responseGrade: string;
  anomalies: number;
  summary: string;
  sheetReference: string;
}): SlackBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Daily Dispatch Audit", emoji: false },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*Personal Sedan Services* · Las Vegas · ${input.auditDate}` },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Trips*\n${input.totalTrips}` },
        { type: "mrkdwn", text: `*Revenue*\n${input.revenue}` },
        { type: "mrkdwn", text: `*Tone*\n${input.toneScore} / 5` },
        { type: "mrkdwn", text: `*Response*\n${input.responseGrade}` },
        { type: "mrkdwn", text: `*Anomalies*\n${input.anomalies}` },
        { type: "mrkdwn", text: `*Sheet row*\n${input.sheetReference}` },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Executive summary*\n${input.summary}` },
    },
  ];
}

/** High-priority AR card for #ar-alerts. */
export function buildArEscalationBlocks(input: {
  corporateName: string;
  invoiceNumber: string;
  balanceDue: string;
  daysPastDue: number;
  escalationLevel: string;
  draftUrl: string;
  gmailUrl: string | null;
}): SlackBlock[] {
  const fields: SlackBlock[] = [
    { type: "mrkdwn", text: `*Account*\n${input.corporateName}` },
    { type: "mrkdwn", text: `*Invoice*\n${input.invoiceNumber}` },
    { type: "mrkdwn", text: `*Balance due*\n${input.balanceDue}` },
    { type: "mrkdwn", text: `*Days past due*\n${input.daysPastDue}` },
  ];

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "AR Escalation — Draft Ready", emoji: false },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `*Priority* · ${input.escalationLevel.toUpperCase()} · Review before sending`,
        },
      ],
    },
    { type: "divider" },
    { type: "section", fields },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open console draft", emoji: false },
          url: input.draftUrl,
          style: "primary",
        },
        ...(input.gmailUrl
          ? [
              {
                type: "button",
                text: { type: "plain_text", text: "Open in Gmail", emoji: false },
                url: input.gmailUrl,
              },
            ]
          : []),
      ],
    },
  ];

  return blocks;
}

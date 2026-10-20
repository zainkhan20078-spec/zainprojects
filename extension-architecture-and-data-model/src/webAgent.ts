import { routeAIRequest } from "./aiRouter";
import {
  findBestElementByHint,
  isDestructiveActionLabel,
  summarizeInteractiveMap,
  type AgentPageSnapshot,
  type InteractiveElement,
} from "./domExtractor";

export type AgentMode = "watch" | "auto";

export type AgentActionType = "click" | "type" | "scroll" | "wait" | "captcha";

export interface AgentAction {
  type: AgentActionType;
  targetHint?: string;
  value?: string;
  scrollBy?: number;
  waitMs?: number;
  destructive?: boolean;
}

export interface AgentRunOptions {
  goal: string;
  mode: AgentMode;
  maxSteps?: number;
  onStatus?: (message: string) => void;
  requestPermission?: (action: AgentAction) => Promise<boolean>;
}

export interface ActivePageText {
  url: string;
  title: string;
  text: string;
  truncated: boolean;
}

interface ContentScriptResponse<T> {
  ok: boolean;
  payload?: T;
  error?: string;
}

function ensureChromeTabs(): void {
  if (typeof chrome === "undefined" || !chrome.tabs?.query || !chrome.tabs.sendMessage) {
    throw new Error("Chrome tabs messaging is unavailable.");
  }
}

async function getActiveTabId(): Promise<number> {
  ensureChromeTabs();
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (!tabId) {
    throw new Error("No active tab found for web agent.");
  }
  return tabId;
}

async function sendToActiveTab<T>(message: Record<string, unknown>): Promise<T> {
  const tabId = await getActiveTabId();
  const response = (await chrome.tabs.sendMessage(tabId, message)) as T;
  return response;
}

async function getSnapshot(): Promise<AgentPageSnapshot> {
  const response = await sendToActiveTab<ContentScriptResponse<AgentPageSnapshot>>({
    type: "AGENT_GET_SNAPSHOT",
  });

  if (!response.ok || !response.payload) {
    throw new Error(response.error ?? "Agent snapshot failed.");
  }

  return response.payload;
}

export async function readCurrentPage(): Promise<ActivePageText> {
  const response = await sendToActiveTab<ContentScriptResponse<ActivePageText>>({
    type: "READ_CURRENT_PAGE",
  });
  if (!response.ok || !response.payload) {
    throw new Error(response.error ?? "Unable to read the current webpage.");
  }
  return response.payload;
}

function parseActionLines(raw: string): AgentAction[] {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);

  const actions: AgentAction[] = [];
  for (const line of lines) {
    if (/captcha/i.test(line)) {
      actions.push({ type: "captcha" });
      continue;
    }

    if (/scroll/i.test(line)) {
      const value = Number(line.match(/-?\d+/)?.[0] ?? "400");
      actions.push({ type: "scroll", scrollBy: Number.isFinite(value) ? value : 400 });
      continue;
    }

    if (/wait/i.test(line)) {
      const value = Number(line.match(/\d+/)?.[0] ?? "500");
      actions.push({ type: "wait", waitMs: Number.isFinite(value) ? value : 500 });
      continue;
    }

    if (/type/i.test(line)) {
      const hint = line.match(/into\s+"([^"]+)"|into\s+'([^']+)'|into\s+([^,]+)/i);
      const value = line.match(/text\s*[:=]\s*"([^"]+)"|text\s*[:=]\s*'([^']+)'/i);
      const targetHint = (hint?.[1] ?? hint?.[2] ?? hint?.[3] ?? "input").trim();
      const textValue = value?.[1] ?? value?.[2] ?? "";
      actions.push({
        type: "type",
        targetHint,
        value: textValue,
        destructive: isDestructiveActionLabel(`${targetHint} ${textValue}`),
      });
      continue;
    }

    if (/click/i.test(line)) {
      const hint = line.match(/"([^"]+)"|'([^']+)'|click\s+(.+)/i);
      const targetHint = (hint?.[1] ?? hint?.[2] ?? hint?.[3] ?? "button").trim();
      actions.push({
        type: "click",
        targetHint,
        destructive: isDestructiveActionLabel(targetHint),
      });
      continue;
    }
  }

  return actions;
}

function fallbackPlan(goal: string, elements: InteractiveElement[]): AgentAction[] {
  const lower = goal.toLowerCase();
  const actions: AgentAction[] = [];

  if (lower.includes("captcha")) {
    actions.push({ type: "captcha" });
  }

  if (lower.includes("scroll")) {
    actions.push({ type: "scroll", scrollBy: 500 });
  }

  const candidate = findBestElementByHint(elements, goal);
  if (candidate) {
    if (candidate.role === "input" || candidate.role === "textarea") {
      actions.push({ type: "type", targetHint: candidate.selector, value: goal });
    } else {
      actions.push({
        type: "click",
        targetHint: candidate.selector,
        destructive: isDestructiveActionLabel(candidate.text),
      });
    }
  }

  if (actions.length === 0) {
    actions.push({ type: "wait", waitMs: 500 });
  }

  return actions;
}

async function generateActionPlan(goal: string, snapshot: AgentPageSnapshot): Promise<AgentAction[]> {
  const mapSummary = summarizeInteractiveMap(snapshot.interactiveMap, 24);
  const result = await routeAIRequest({
    prompt: [
      "Create a compact web automation action list.",
      "Return only action lines, max 6 lines.",
      "Formats:",
      'CLICK "target hint"',
      'TYPE into "target hint" text="value"',
      "SCROLL 400",
      "WAIT 800",
      "CAPTCHA",
      "Goal:",
      goal,
      "Interactive map:",
      mapSummary,
    ].join("\n"),
  });

  const planned = parseActionLines(result.text);
  return planned.length > 0 ? planned : fallbackPlan(goal, snapshot.interactiveMap);
}

async function executeAction(action: AgentAction): Promise<void> {
  const response = await sendToActiveTab<ContentScriptResponse<null>>({
    type: "AGENT_EXECUTE_ACTION",
    payload: action,
  });

  if (!response.ok) {
    throw new Error(response.error ?? `Action failed: ${action.type}`);
  }
}

async function previewAction(action: AgentAction): Promise<void> {
  await sendToActiveTab<ContentScriptResponse<null>>({
    type: "AGENT_PREVIEW_ACTION",
    payload: action,
  });
}

function needsConfirmation(action: AgentAction, mode: AgentMode): boolean {
  if (mode === "watch") {
    return true;
  }

  return Boolean(action.destructive);
}

export async function runWebAgent(options: AgentRunOptions): Promise<void> {
  const maxSteps = options.maxSteps ?? 8;
  options.onStatus?.(`Agent starting in ${options.mode.toUpperCase()} mode.`);

  let snapshot = await getSnapshot();

  for (let step = 0; step < maxSteps; step += 1) {
    const plan = await generateActionPlan(options.goal, snapshot);
    const action = plan[0];
    if (!action) {
      options.onStatus?.("Agent produced no further actions.");
      return;
    }

    if (needsConfirmation(action, options.mode)) {
      await previewAction(action);
      const allowed = options.requestPermission
        ? await options.requestPermission(action)
        : window.confirm(
            `Agent wants to ${action.type}${action.targetHint ? ` on ${action.targetHint}` : ""}. Continue?`,
          );
      if (!allowed) {
        options.onStatus?.("Agent action denied by user.");
        return;
      }
    }

    options.onStatus?.(`Step ${step + 1}: ${action.type}${action.targetHint ? ` (${action.targetHint})` : ""}`);
    await executeAction(action);

    if (action.type === "captcha") {
      options.onStatus?.("CAPTCHA handling requested.");
    }

    await new Promise((resolve) => setTimeout(resolve, 450));
    snapshot = await getSnapshot();
  }

  options.onStatus?.("Agent finished max steps.");
}

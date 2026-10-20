import { addWatchModeHighlight, detectCaptchaFindings, solveCaptchaWithFallback } from "./captchaSolver";
import { classifyRole, findBestElementByHint, type AgentPageSnapshot, type InteractiveElement } from "./domExtractor";
import {
  generateMousePath,
  randomScrollStep,
  randomTypingDelay,
  shouldMakeTypingMistake,
  typoForChar,
} from "./humanSimulator";
import type { AgentAction } from "./webAgent";

interface FullPageCaptureChunk {
  index: number;
  start: number;
  end: number;
  text: string;
}

interface FullPageCaptureResult {
  url: string;
  title: string;
  fullText: string;
  html: string;
  chunks: FullPageCaptureChunk[];
}

const CHUNK_SIZE = 7000;
const OVERLAP_SIZE = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cssPathFor(element: Element): string {
  if ((element as HTMLElement).id) {
    return `#${CSS.escape((element as HTMLElement).id)}`;
  }

  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 4) {
    const tag = current.tagName.toLowerCase();
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter((child) => child.tagName.toLowerCase() === tag)
      : [];
    const index = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : "";
    parts.unshift(`${tag}${index}`);
    current = current.parentElement;
  }

  return parts.join(" > ");
}

function getInteractiveMap(): InteractiveElement[] {
  const selector = "input, button, a[href], select, textarea, [role='button'], [tabindex]";
  const nodes = Array.from(document.querySelectorAll(selector)) as HTMLElement[];

  return nodes
    .slice(0, 220)
    .map((node, index) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        style.opacity !== "0";

      return {
        id: `${index}:${node.tagName.toLowerCase()}`,
        role: classifyRole(node.tagName, node.getAttribute("type") ?? undefined),
        selector: cssPathFor(node),
        text: (node.innerText || node.textContent || "").trim().slice(0, 120),
        placeholder: node.getAttribute("placeholder") ?? undefined,
        ariaLabel: node.getAttribute("aria-label") ?? undefined,
        disabled: (node as HTMLInputElement).disabled === true,
        visible,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };
    })
    .filter((entry) => entry.visible);
}

function getAgentSnapshot(): AgentPageSnapshot {
  return {
    url: window.location.href,
    title: document.title,
    interactiveMap: getInteractiveMap(),
  };
}

let highlighted: HTMLElement | null = null;

function clearHighlight(): void {
  if (!highlighted) {
    return;
  }
  highlighted.style.outline = "";
  highlighted.style.outlineOffset = "";
  highlighted = null;
}

function findElementByHint(hint: string): HTMLElement | null {
  const map = getInteractiveMap();
  const best = findBestElementByHint(map, hint);
  if (best) {
    const selected = document.querySelector(best.selector);
    if (selected instanceof HTMLElement) {
      return selected;
    }
  }

  try {
    const direct = document.querySelector(hint);
    return direct instanceof HTMLElement ? direct : null;
  } catch {
    return null;
  }
}

function dispatchMouse(type: string, x: number, y: number, target: HTMLElement): void {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      view: window,
    }),
  );
}

async function humanClick(target: HTMLElement): Promise<void> {
  const rect = target.getBoundingClientRect();
  const end = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const start = { x: Math.max(2, end.x - 120), y: Math.max(2, end.y - 90) };
  const path = generateMousePath(start, end, { steps: 20, jitter: 1.6 });

  for (const point of path) {
    dispatchMouse("mousemove", point.x, point.y, target);
    await sleep(12 + Math.floor(Math.random() * 20));
  }

  target.focus();
  await sleep(80 + Math.floor(Math.random() * 60));
  dispatchMouse("mousedown", end.x, end.y, target);
  await sleep(40 + Math.floor(Math.random() * 40));
  dispatchMouse("mouseup", end.x, end.y, target);
  dispatchMouse("click", end.x, end.y, target);
}

function dispatchInput(target: HTMLInputElement | HTMLTextAreaElement): void {
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
}

async function humanType(target: HTMLInputElement | HTMLTextAreaElement, text: string): Promise<void> {
  target.focus();
  target.click();

  for (const char of text) {
    const shouldMistake = shouldMakeTypingMistake(0.05) && /[a-zA-Z]/.test(char);
    if (shouldMistake) {
      const typo = typoForChar(char);
      target.value += typo;
      dispatchInput(target);
      await sleep(randomTypingDelay());
      await sleep(300);
      target.value = target.value.slice(0, -1);
      dispatchInput(target);
      await sleep(randomTypingDelay());
    }

    target.value += char;
    dispatchInput(target);
    await sleep(randomTypingDelay());
  }
}

async function humanScroll(scrollBy?: number): Promise<void> {
  const distance = typeof scrollBy === "number" ? scrollBy : randomScrollStep();
  const slices = Math.max(4, Math.floor(Math.abs(distance) / 100));
  const perSlice = distance / slices;

  for (let index = 0; index < slices; index += 1) {
    window.scrollBy({ top: perSlice, behavior: "auto" });
    await sleep(25 + Math.floor(Math.random() * 70));
  }
}

async function previewAction(action: AgentAction): Promise<{ ok: boolean; message: string }> {
  clearHighlight();
  if (action.type === "captcha") {
    const finding = detectCaptchaFindings().find((candidate) => candidate.visible) ?? detectCaptchaFindings()[0];
    if (finding) {
      addWatchModeHighlight(finding);
      return { ok: true, message: `${finding.label} detected and highlighted.` };
    }
    return { ok: true, message: "No CAPTCHA currently visible." };
  }

  if (!action.targetHint) {
    return { ok: true, message: `No specific target needed for ${action.type}.` };
  }

  const target = findElementByHint(action.targetHint);
  if (!target) {
    return { ok: false, message: `Target not found: ${action.targetHint}` };
  }

  highlighted = target;
  highlighted.style.outline = "2px dashed #22d3ee";
  highlighted.style.outlineOffset = "2px";
  highlighted.scrollIntoView({ behavior: "smooth", block: "center" });
  return { ok: true, message: `Highlighted ${action.type} target.` };
}

async function executeAgentAction(action: AgentAction): Promise<{ ok: boolean; message: string }> {
  if (action.type === "wait") {
    await sleep(action.waitMs ?? 600);
    return { ok: true, message: "Wait complete." };
  }

  if (action.type === "scroll") {
    await humanScroll(action.scrollBy);
    return { ok: true, message: "Scroll complete." };
  }

  if (action.type === "captcha") {
    const result = await solveCaptchaWithFallback();
    return {
      ok: result.solved,
      message: result.message,
    };
  }

  if (!action.targetHint) {
    return { ok: false, message: "Missing target hint for action." };
  }

  const target = findElementByHint(action.targetHint);
  if (!target) {
    return { ok: false, message: `Target not found: ${action.targetHint}` };
  }

  await humanClick(target);

  if (action.type === "click") {
    clearHighlight();
    return { ok: true, message: "Click complete." };
  }

  if (action.type === "type") {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      return { ok: false, message: "Target is not a text input." };
    }

    await humanType(target, action.value ?? "");
    clearHighlight();
    return { ok: true, message: "Typing complete." };
  }

  return { ok: false, message: `Unsupported action: ${action.type}` };
}

async function forceLoadByScrolling(): Promise<void> {
  const maxSteps = 120;
  let previousHeight = 0;

  for (let step = 0; step < maxSteps; step += 1) {
    const currentHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);

    window.scrollTo({ top: currentHeight, behavior: "auto" });
    await sleep(140);

    const nextHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);

    if (nextHeight <= previousHeight) {
      await sleep(200);
      const stableHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      if (stableHeight <= nextHeight) {
        break;
      }
    }

    previousHeight = nextHeight;
  }

  window.scrollTo({ top: 0, behavior: "auto" });
}

function chunkTextWithOverlap(text: string): FullPageCaptureChunk[] {
  const chunks: FullPageCaptureChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push({
      index,
      start,
      end,
      text: text.slice(start, end),
    });

    if (end >= text.length) {
      break;
    }

    start = Math.max(0, end - OVERLAP_SIZE);
    index += 1;
  }

  return chunks;
}

function monitorForCaptcha(): void {
  let lastNotifiedElement: HTMLElement | null = null;

  const notifyIfCaptchaAppears = () => {
    const finding = detectCaptchaFindings().find((candidate) => candidate.kind !== "badge" && candidate.visible);
    if (!finding) {
      lastNotifiedElement = null;
      return;
    }

    addWatchModeHighlight(finding);
    if (lastNotifiedElement === finding.element) {
      return;
    }
    lastNotifiedElement = finding.element;

    const message = `${finding.label} detected. Please solve it manually in the page; automation is paused.`;
    void chrome.runtime
      .sendMessage({
        type: "CAPTCHA_MANUAL_REQUIRED",
        payload: { message, provider: finding.provider, kind: finding.kind },
      })
      .catch((error: unknown) => {
        console.error("Unable to notify the extension about a detected CAPTCHA.", error);
      });
  };

  const observer = new MutationObserver(notifyIfCaptchaAppears);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "src", "style", "title"],
    childList: true,
    subtree: true,
  });
  notifyIfCaptchaAppears();
}

async function captureFullPage(): Promise<FullPageCaptureResult> {
  await forceLoadByScrolling();

  const fullText = document.body?.innerText ?? "";
  const html = document.documentElement?.outerHTML ?? "";
  const chunks = chunkTextWithOverlap(fullText);

  return {
    url: window.location.href,
    title: document.title,
    fullText,
    html,
    chunks,
  };
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  monitorForCaptcha();

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!message || typeof message !== "object" || !("type" in message)) {
      return;
    }

    const type = (message as { type: string }).type;

    if (type === "CAPTURE_FULL_PAGE") {
      void (async () => {
        try {
          const payload = await captureFullPage();
          sendResponse({ ok: true, payload });
        } catch (error) {
          const messageText = error instanceof Error ? error.message : "Full page capture failed";
          sendResponse({ ok: false, error: messageText });
        }
      })();

      return true;
    }

    if (type === "AGENT_GET_SNAPSHOT") {
      sendResponse({ ok: true, payload: getAgentSnapshot() });
      return;
    }

    if (type === "READ_CURRENT_PAGE") {
      const pageText = document.body?.innerText ?? "";
      sendResponse({
        ok: true,
        payload: {
          url: window.location.href,
          title: document.title,
          text: pageText.slice(0, 40_000),
          truncated: pageText.length > 40_000,
        },
      });
      return;
    }

    if (type === "AGENT_PREVIEW_ACTION") {
      void (async () => {
        const payload = (message as { payload?: AgentAction }).payload;
        if (!payload) {
          sendResponse({ ok: false, error: "Missing action payload." });
          return;
        }

        const result = await previewAction(payload);
        sendResponse(
          result.ok ? { ok: true, payload: null, message: result.message } : { ok: false, error: result.message },
        );
      })();
      return true;
    }

    if (type === "AGENT_EXECUTE_ACTION") {
      void (async () => {
        try {
          const payload = (message as { payload?: AgentAction }).payload;
          if (!payload) {
            sendResponse({ ok: false, error: "Missing action payload." });
            return;
          }

          const result = await executeAgentAction(payload);
          if (!result.ok) {
            sendResponse({ ok: false, error: result.message });
            return;
          }

          sendResponse({ ok: true, payload: null, message: result.message });
        } catch (error) {
          const messageText = error instanceof Error ? error.message : "Agent action execution failed";
          sendResponse({ ok: false, error: messageText });
        }
      })();

      return true;
    }
  });
}

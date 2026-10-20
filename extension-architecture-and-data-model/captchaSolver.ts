export interface CaptchaSolveResult {
  solved: boolean;
  level: 0 | 1 | 2 | 3;
  message: string;
}

export type CaptchaProvider = "recaptcha" | "hcaptcha" | "turnstile" | "generic";
export type CaptchaKind = "checkbox" | "challenge" | "badge" | "unknown";

export interface CaptchaFinding {
  element: HTMLElement;
  provider: CaptchaProvider;
  kind: CaptchaKind;
  label: string;
  visible: boolean;
}

export interface CaptchaWaitOptions {
  /** How long to wait for the user to solve the challenge manually. */
  waitTimeoutMs?: number;
  /** How often to re-check whether the challenge is gone. */
  pollIntervalMs?: number;
  /** Called when the user is asked to step in; wire this to the extension UI. */
  notifyManualRequired?: (message: string) => void;
}

interface Deps {
  detect: () => CaptchaFinding[];
  sleep: (ms: number) => Promise<void>;
  highlight: (finding: CaptchaFinding) => void;
}

const PROVIDER_DETECTORS: Array<{
  provider: CaptchaProvider;
  selectors: string[];
  kind: CaptchaKind;
  label: string;
}> = [
  {
    provider: "recaptcha",
    selectors: ["iframe[src*='recaptcha/api2/anchor']", ".g-recaptcha", ".g-recaptcha-badge"],
    kind: "checkbox",
    label: "reCAPTCHA",
  },
  {
    provider: "recaptcha",
    selectors: ["iframe[src*='recaptcha/api2/bframe']", "iframe[src*='recaptcha'][src*='bframe']"],
    kind: "challenge",
    label: "reCAPTCHA challenge",
  },
  {
    provider: "recaptcha",
    selectors: [".g-recaptcha-badge", "iframe[src*='recaptcha/releases']"],
    kind: "badge",
    label: "reCAPTCHA badge",
  },
  {
    provider: "hcaptcha",
    selectors: ["iframe[src*='hcaptcha.com']", ".h-captcha", "[data-hcaptcha-widget-id]"],
    kind: "checkbox",
    label: "hCaptcha",
  },
  {
    provider: "turnstile",
    selectors: ["iframe[src*='challenges.cloudflare.com']", ".cf-turnstile"],
    kind: "checkbox",
    label: "Cloudflare Turnstile",
  },
  {
    provider: "generic",
    selectors: ["iframe[title*='captcha' i]", "[id*='captcha' i]", "[class*='captcha' i]"],
    kind: "unknown",
    label: "CAPTCHA",
  },
];

const KIND_PRIORITY: Record<CaptchaKind, number> = {
  checkbox: 0,
  challenge: 1,
  unknown: 2,
  badge: 3,
};

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
}

function classifyElement(element: HTMLElement): CaptchaFinding {
  const source =
    `${element.tagName} ${element.getAttribute("src") ?? ""} ${element.id} ${element.className}`.toLowerCase();

  for (const detector of PROVIDER_DETECTORS) {
    if (!detector.selectors.some((selector) => element.matches(selector))) {
      continue;
    }

    let kind = detector.kind;
    if (detector.provider === "recaptcha" && source.includes("bframe")) {
      kind = "challenge";
    } else if (detector.provider === "recaptcha" && source.includes("badge")) {
      kind = "badge";
    } else if (detector.provider === "recaptcha" && source.includes("anchor")) {
      kind = "checkbox";
    }

    return {
      element,
      provider: detector.provider,
      kind,
      label: detector.label,
      visible: isVisible(element),
    };
  }

  return {
    element,
    provider: "generic",
    kind: "unknown",
    label: "CAPTCHA",
    visible: isVisible(element),
  };
}

export function detectCaptchaFindings(): CaptchaFinding[] {
  if (typeof document === "undefined") {
    return [];
  }

  const selector = PROVIDER_DETECTORS.flatMap((detector) => detector.selectors).join(", ");
  const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));

  const findings: CaptchaFinding[] = [];
  const seen = new Set<HTMLElement>();
  for (const element of elements) {
    if (seen.has(element)) {
      continue;
    }
    seen.add(element);
    findings.push(classifyElement(element));
  }

  return findings.sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]);
}

export function addWatchModeHighlight(finding: CaptchaFinding): void {
  const { element } = finding;
  if (element.dataset.captchaHighlight === "true") {
    return;
  }

  element.dataset.captchaHighlight = "true";
  element.dataset.captchaPreviousOutline = element.style.outline;
  element.style.outline = "3px solid #ef4444";
  element.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function clearCaptchaHighlight(element: HTMLElement): void {
  if (element.dataset.captchaHighlight !== "true") {
    return;
  }

  element.style.outline = element.dataset.captchaPreviousOutline ?? "";
  delete element.dataset.captchaHighlight;
  delete element.dataset.captchaPreviousOutline;
}

/**
 * Human-in-the-loop CAPTCHA handling.
 *
 * CAPTCHA widgets live in cross-origin iframes that synthetic events cannot
 * reach, so this module never tries to "click through" them. It detects the
 * provider, highlights the widget, notifies the extension UI, and then waits
 * for the user to solve it before reporting the outcome to the agent.
 */
export async function solveCaptchaWithFallback(
  options: CaptchaWaitOptions = {},
  deps: Deps = {
    detect: detectCaptchaFindings,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    highlight: addWatchModeHighlight,
  },
): Promise<CaptchaSolveResult> {
  const waitTimeoutMs = options.waitTimeoutMs ?? 120_000;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const deadline = Date.now() + waitTimeoutMs;

  const findings = deps.detect();
  const interactive = findings.filter((candidate) => candidate.kind !== "badge");
  const first = interactive.find((candidate) => candidate.visible) ?? interactive[0] ?? findings[0];

  if (!first) {
    return {
      solved: true,
      level: 0,
      message: "No CAPTCHA detected.",
    };
  }

  let target: CaptchaFinding = first;

  deps.highlight(target);

  const message =
    `${target.label} detected. Please solve it in the page — ` + `the agent will continue once it is gone.`;

  options.notifyManualRequired?.(message);
  if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
    void chrome.runtime.sendMessage({
      type: "CAPTCHA_MANUAL_REQUIRED",
      payload: { message, provider: target.provider, kind: target.kind },
    });
  }

  while (Date.now() < deadline) {
    await deps.sleep(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
    const seen: CaptchaFinding = target;
    const remaining: CaptchaFinding[] = deps.detect().filter((candidate) => candidate.element !== seen.element);

    if (remaining.length === 0) {
      clearCaptchaHighlight(seen.element);
      return {
        solved: true,
        level: 2,
        message: `${seen.label} solved manually by the user.`,
      };
    }

    const next: CaptchaFinding = remaining.find((candidate) => candidate.visible) ?? remaining[0];
    if (next.element !== seen.element) {
      clearCaptchaHighlight(seen.element);
      target = next;
      deps.highlight(target);
    }
  }

  return {
    solved: false,
    level: 3,
    message: `Timed out waiting for manual ${target.label} solution.`,
  };
}

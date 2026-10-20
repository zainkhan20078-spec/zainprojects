// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectCaptchaFindings, solveCaptchaWithFallback, type CaptchaFinding } from "../captchaSolver";

afterEach(() => {
  document.body.innerHTML = "";
});

function iframe(src: string): HTMLIFrameElement {
  const element = document.createElement("iframe");
  element.setAttribute("src", src);
  document.body.appendChild(element);
  return element;
}

function findingFor(element: HTMLElement): CaptchaFinding {
  const actual = detectCaptchaFindings().find((candidate) => candidate.element === element);
  if (!actual) {
    throw new Error("Expected element to be detected as a CAPTCHA");
  }
  return actual;
}

describe("detectCaptchaFindings", () => {
  it("classifies reCAPTCHA, hCaptcha and Turnstile widgets", () => {
    const recaptcha = iframe("https://www.google.com/recaptcha/api2/anchor?foo=1");
    const hcaptcha = iframe("https://newassets.hcaptcha.com/captcha/v1/frame");
    const turnstile = iframe("https://challenges.cloudflare.com/cdn-cgi/challenge-platform/turnstile");

    expect(findingFor(recaptcha).provider).toBe("recaptcha");
    expect(findingFor(hcaptcha).provider).toBe("hcaptcha");
    expect(findingFor(turnstile).provider).toBe("turnstile");
  });

  it("marks reCAPTCHA challenge frames as challenges and anchors as checkboxes", () => {
    const anchor = iframe("https://www.google.com/recaptcha/api2/anchor?ar=1");
    const challenge = iframe("https://www.google.com/recaptcha/api2/bframe?ar=1");

    expect(findingFor(anchor).kind).toBe("checkbox");
    expect(findingFor(challenge).kind).toBe("challenge");
  });

  it("sorts checkbox-style widgets ahead of badges", () => {
    const badge = document.createElement("div");
    badge.className = "g-recaptcha-badge";
    document.body.appendChild(badge);
    const checkbox = iframe("https://www.google.com/recaptcha/api2/anchor");

    const findings = detectCaptchaFindings();
    expect(findings[0].element).toBe(checkbox);
    expect(findings[findings.length - 1].element).toBe(badge);
  });

  it("returns an empty list on pages without CAPTCHAs", () => {
    expect(detectCaptchaFindings()).toEqual([]);
  });
});

describe("solveCaptchaWithFallback", () => {
  function makeDeps(detectImpl: () => CaptchaFinding[]) {
    return {
      detect: vi.fn(detectImpl),
      sleep: vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined),
      highlight: vi.fn(),
    };
  }

  function fakeFinding(element: HTMLElement): CaptchaFinding {
    return {
      element,
      provider: "recaptcha",
      kind: "checkbox",
      label: "reCAPTCHA",
      visible: true,
    };
  }

  it("reports success immediately when no CAPTCHA exists", async () => {
    const deps = makeDeps(() => []);
    const result = await solveCaptchaWithFallback({}, deps);

    expect(result).toMatchObject({ solved: true, level: 0 });
    expect(deps.highlight).not.toHaveBeenCalled();
  });

  it("highlights the widget and notifies the UI that manual solving is required", async () => {
    const element = document.createElement("div");
    const finding = fakeFinding(element);
    const notify = vi.fn();
    const deps = makeDeps(() => [finding]);

    // Simulate the user solving the challenge on the first poll.
    let polled = false;
    deps.detect.mockImplementation(() => (polled ? [] : [finding]));
    deps.sleep.mockImplementation(async () => {
      polled = true;
    });

    const result = await solveCaptchaWithFallback({ notifyManualRequired: notify }, deps);

    expect(deps.highlight).toHaveBeenCalledWith(finding);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("reCAPTCHA"));
    expect(result).toMatchObject({ solved: true, level: 2 });
  });

  it("times out when the CAPTCHA is never solved", async () => {
    const element = document.createElement("div");
    const finding = fakeFinding(element);
    const deps = makeDeps(() => [finding]);

    const result = await solveCaptchaWithFallback({ waitTimeoutMs: 0 }, deps);

    expect(result).toMatchObject({ solved: false, level: 3 });
    expect(result.message).toContain("Timed out");
  });
});

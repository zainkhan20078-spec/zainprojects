import { describe, expect, it } from "vitest";
import {
  gaussianRandom,
  generateMousePath,
  randomScrollStep,
  randomTypingDelay,
  shouldMakeTypingMistake,
  typoForChar,
} from "../humanSimulator";

describe("gaussianRandom", () => {
  it("stays at or above the 10ms floor", () => {
    for (let index = 0; index < 500; index += 1) {
      expect(gaussianRandom(15, 500)).toBeGreaterThanOrEqual(10);
    }
  });
});

describe("generateMousePath", () => {
  it("produces exactly steps+1 points ending on the target", () => {
    const from = { x: 10, y: 10 };
    const to = { x: 300, y: 240 };
    const path = generateMousePath(from, to, { steps: 18, jitter: 1.5 });

    expect(path).toHaveLength(19);
    expect(path[path.length - 1]).toEqual(to);
  });

  it("stays near the straight line between the endpoints", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 100 };
    const path = generateMousePath(from, to, { steps: 24, jitter: 2 });

    for (const point of path) {
      expect(point.x).toBeGreaterThanOrEqual(-25);
      expect(point.x).toBeLessThanOrEqual(125);
      expect(point.y).toBeGreaterThanOrEqual(-25);
      expect(point.y).toBeLessThanOrEqual(125);
    }
  });
});

describe("randomTypingDelay", () => {
  it("stays within the 50-250ms human range", () => {
    for (let index = 0; index < 300; index += 1) {
      const delay = randomTypingDelay();
      expect(delay).toBeGreaterThanOrEqual(50);
      expect(delay).toBeLessThanOrEqual(250);
    }
  });
});

describe("shouldMakeTypingMistake", () => {
  it("never triggers at chance 0 and always triggers at chance 1", () => {
    expect(shouldMakeTypingMistake(0)).toBe(false);
    expect(shouldMakeTypingMistake(1)).toBe(true);
  });
});

describe("typoForChar", () => {
  it("returns a neighbouring letter for lowercase input", () => {
    for (let index = 0; index < 50; index += 1) {
      expect(["a", "c"]).toContain(typoForChar("b"));
    }
  });

  it("preserves the case of the original character", () => {
    for (let index = 0; index < 50; index += 1) {
      expect(["A", "C"]).toContain(typoForChar("B"));
    }
  });

  it("returns non-letters unchanged", () => {
    expect(typoForChar("5")).toBe("5");
    expect(typoForChar(" ")).toBe(" ");
    expect(typoForChar("ñ")).toBe("ñ");
  });
});

describe("randomScrollStep", () => {
  it("returns mostly downward steps within the expected range", () => {
    let downward = 0;
    for (let index = 0; index < 200; index += 1) {
      const step = randomScrollStep();
      expect(Math.abs(step)).toBeGreaterThanOrEqual(80);
      expect(Math.abs(step)).toBeLessThanOrEqual(500);
      if (step > 0) downward += 1;
    }
    expect(downward).toBeGreaterThan(120);
  });
});

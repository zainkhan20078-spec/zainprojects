import { describe, expect, it } from "vitest";
import { buildHighlightDirectives, normalizeDocName } from "../documentBlueprint";

describe("normalizeDocName", () => {
  it("trims whitespace and surrounding quotes", () => {
    expect(normalizeDocName("  'Physics'  ")).toBe("Physics");
    expect(normalizeDocName('"Thermodynamics"')).toBe("Thermodynamics");
  });

  it("caps names at 120 characters", () => {
    expect(normalizeDocName("a".repeat(200))).toHaveLength(120);
  });

  it("falls back to a default name for empty input", () => {
    expect(normalizeDocName("   ")).toBe("Untitled Notes");
  });
});

describe("buildHighlightDirectives", () => {
  it("marks formula-like sentences in light blue", () => {
    const directives = buildHighlightDirectives("Force equals mass. F = ma holds.");
    expect(directives).toHaveLength(1);
    expect(directives[0]).toMatchObject({
      color: "lightBlue",
      reason: "formula",
    });
  });

  it("marks definition-like sentences in yellow", () => {
    const text = "Momentum is defined as mass times velocity. Nothing else here.";
    const directives = buildHighlightDirectives(text);
    expect(directives).toHaveLength(1);
    expect(directives[0]).toMatchObject({
      color: "yellow",
      reason: "definition",
    });
  });

  it("uses offsets that slice back to the original sentence", () => {
    const text = "Energy is important. E = hf gives quantum energy.";
    const directives = buildHighlightDirectives(text);
    for (const directive of directives) {
      expect(text.slice(directive.start, directive.end).trim().length).toBeGreaterThan(0);
    }
    expect(directives).toHaveLength(2);
  });

  it("returns nothing for plain prose", () => {
    expect(buildHighlightDirectives("The cat sat on the mat. It was happy.")).toHaveLength(0);
  });
});

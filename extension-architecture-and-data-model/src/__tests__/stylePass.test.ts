import { describe, expect, it } from "vitest";
import { applyStylePass, enforceHumanStyle } from "../stylePass";

describe("enforceHumanStyle", () => {
  it("strips AI self-references", () => {
    expect(enforceHumanStyle("As an AI language model, I cannot do that.")).not.toMatch(/ai/i);
  });

  it("removes robotic openers", () => {
    const result = enforceHumanStyle("Sure! Here is the summary you requested.\nActual content.");
    expect(result.startsWith("Actual")).toBe(true);
  });

  it("collapses excess blank lines and repeated spaces", () => {
    expect(enforceHumanStyle("a\n\n\n\nb  c")).toBe("a\n\nb c");
  });

  it("falls back to the trimmed original when stripping empties the text", () => {
    expect(enforceHumanStyle("  as an ai  ")).toBe("as an ai");
  });
});

describe("applyStylePass", () => {
  it("uses the model rewrite when the call succeeds", async () => {
    const result = await applyStylePass("rough draft", async () => "polished draft");
    expect(result).toBe("polished draft");
  });

  it("falls back to local enforcement when the model call fails", async () => {
    const result = await applyStylePass("Certainly! Notes follow.", async () => {
      throw new Error("provider down");
    });
    expect(result).toBe("Notes follow.");
  });

  it("applies local enforcement when no model call is provided", async () => {
    const result = await applyStylePass("Certainly! Notes follow.");
    expect(result).toBe("Notes follow.");
  });
});

import { describe, expect, it } from "vitest";
import { applyTextMacroOnSpace, findMacroBeforeCaret, resolveMathMacro } from "../components/MacroEngine";

describe("findMacroBeforeCaret", () => {
  it("finds the macro token ending at the caret", () => {
    const match = findMacroBeforeCaret("value \\mps", 11);
    expect(match).toEqual({ token: "\\mps", start: 6, end: 11 });
  });

  it("returns null when no macro precedes the caret", () => {
    expect(findMacroBeforeCaret("plain text", 10)).toBeNull();
  });
});

describe("applyTextMacroOnSpace", () => {
  it("expands physics macros with a trailing space", () => {
    const result = applyTextMacroOnSpace({ mode: "physics", text: "speed \\mps", caretIndex: 10 });
    expect(result).toEqual({ applied: true, nextText: "speed m/s ", nextCaret: 10 });
  });

  it("expands lengua accents", () => {
    const result = applyTextMacroOnSpace({ mode: "lengua", text: "\\a", caretIndex: 2 });
    expect(result).toEqual({ applied: true, nextText: "á ", nextCaret: 2 });
  });

  it("keeps text unchanged for unknown macros", () => {
    const result = applyTextMacroOnSpace({ mode: "physics", text: "\\nope", caretIndex: 5 });
    expect(result.applied).toBe(false);
    expect(result.nextText).toBe("\\nope");
  });

  it("does not apply lengua macros in physics mode", () => {
    const result = applyTextMacroOnSpace({ mode: "physics", text: "\\a", caretIndex: 2 });
    expect(result.applied).toBe(false);
  });
});

describe("resolveMathMacro", () => {
  it("maps structural macros to AST nodes", () => {
    expect(resolveMathMacro("\\frac", "math")?.type).toBe("fraction");
    expect(resolveMathMacro("\\sqrt", "math")?.type).toBe("root");
    expect(resolveMathMacro("\\root", "math")?.type).toBe("root");
    expect(resolveMathMacro("\\pow", "math")?.type).toBe("power");
    expect(resolveMathMacro("\\sup", "math")?.type).toBe("power");
    expect(resolveMathMacro("\\sub", "math")?.type).toBe("subscript");
    expect(resolveMathMacro("\\paren", "math")?.type).toBe("group");
    expect(resolveMathMacro("\\vec", "math")?.type).toBe("vector");
    expect(resolveMathMacro("\\lim", "math")?.type).toBe("limit");
    expect(resolveMathMacro("\\der", "math")?.type).toBe("derivative");
  });

  it("only allows integrals in physics mode", () => {
    expect(resolveMathMacro("\\int", "math")).toBeNull();
    expect(resolveMathMacro("\\int", "physics")?.type).toBe("integral");
    expect(resolveMathMacro("\\integral", "physics")?.type).toBe("integral");
  });

  it("returns null for non-macro tokens", () => {
    expect(resolveMathMacro("hello", "math")).toBeNull();
    expect(resolveMathMacro("", "math")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { convertMathAstToPlainText, translateNotebookPayloadToDocText } from "../astToDocs";
import {
  createAtomNode,
  createEquationBlock,
  createFractionNode,
  createTextBlock,
  serializeMathDocument,
  type MathDocument,
} from "../components/MathAST";

function buildDocument(): MathDocument {
  const fraction = createFractionNode();
  fraction.numerator.text = "1";
  fraction.denominator.text = "2";

  return {
    version: 1,
    blocks: [createTextBlock("Notes here"), createEquationBlock([createAtomNode("x+"), fraction])],
  };
}

describe("convertMathAstToPlainText", () => {
  it("returns the raw string unchanged when it is not a serialized document", () => {
    const result = convertMathAstToPlainText("plain study text");
    expect(result).toEqual({ text: "plain study text", usedFallback: false });
  });

  it("renders text blocks and equations as readable lines", () => {
    const result = convertMathAstToPlainText(serializeMathDocument(buildDocument()));
    expect(result.usedFallback).toBe(true);
    expect(result.text).toContain("Notes here");
    expect(result.text).toContain("[Equation] x+ (1)/(2)");
  });
});

describe("translateNotebookPayloadToDocText", () => {
  it("returns empty output for non-object payloads", () => {
    expect(translateNotebookPayloadToDocText("nope")).toEqual({
      textToAppend: "",
      usedEquationFallback: false,
    });
  });

  it("builds one section per non-empty subject in a fixed order", () => {
    const math = serializeMathDocument(buildDocument());
    const result = translateNotebookPayloadToDocText({
      math,
      physics: "F = ma",
      lengua: "",
      aiChat: "answer",
    });

    expect(result.usedEquationFallback).toBe(true);
    expect(result.textToAppend).toContain("Math\n");
    expect(result.textToAppend).toContain("Physics\nF = ma");
    expect(result.textToAppend).not.toContain("Lengua");
    expect(result.textToAppend).toContain("AI Chat\nanswer");
    expect(result.textToAppend.endsWith("\n")).toBe(true);
  });

  it("returns an empty append string when every subject is empty", () => {
    const result = translateNotebookPayloadToDocText({ math: "", physics: "", lengua: "", aiChat: "" });
    expect(result.textToAppend).toBe("");
  });
});

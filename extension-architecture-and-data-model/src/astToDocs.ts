import type { JsonValue } from "./db";
import type { EquationBlock, MathDocument, MathNode } from "./components/MathAST";

export interface DocsTranslationResult {
  textToAppend: string;
  usedEquationFallback: boolean;
}

function asObject(value: unknown): Record<string, JsonValue> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, JsonValue>;
}

function safeString(value: JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

export function renderMathNodeAsText(node: MathNode): string {
  if (node.type === "atom") {
    return node.value.text;
  }

  if (node.type === "fraction") {
    return `(${node.numerator.text})/(${node.denominator.text})`;
  }

  if (node.type === "derivative") {
    return `d/d${node.variable.text}(${node.expression.text})`;
  }

  if (node.type === "vector") {
    return `vector(${node.symbol.text})`;
  }

  if (node.type === "limit") {
    return `lim_{${node.approach.text}} ${node.expression.text}`;
  }

  if (node.type === "integral") {
    return `integral_{${node.lowerBound.text}}^{${node.upperBound.text}} ${node.integrand.text} ${node.variable.text}`;
  }

  if (node.type === "power") {
    return `(${node.base.text})^(${node.exponent.text})`;
  }

  if (node.type === "subscript") {
    return `${node.base.text}_{${node.index.text}}`;
  }

  if (node.type === "root") {
    return `sqrt(${node.radicand.text})`;
  }

  return `(${node.expression.text})`;
}

function renderEquationBlock(block: EquationBlock): string {
  return block.nodes.map((node) => renderMathNodeAsText(node)).join(" ");
}

function parseMathDocument(serialized: string): MathDocument | null {
  if (!serialized.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(serialized) as MathDocument;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.blocks)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function convertMathAstToPlainText(serializedMathAst: string): { text: string; usedFallback: boolean } {
  const parsed = parseMathDocument(serializedMathAst);

  if (!parsed) {
    return {
      text: serializedMathAst,
      usedFallback: false,
    };
  }

  const lines: string[] = [];
  for (const block of parsed.blocks) {
    if (block.type === "text") {
      lines.push(block.text);
      continue;
    }

    lines.push(`[Equation] ${renderEquationBlock(block)}`);
  }

  return {
    text: lines.join("\n"),
    usedFallback: true,
  };
}

export function translateNotebookPayloadToDocText(payload: unknown): DocsTranslationResult {
  const payloadObject = asObject(payload);

  if (!payloadObject) {
    return {
      textToAppend: "",
      usedEquationFallback: false,
    };
  }

  const mathRaw = safeString(payloadObject.math);
  const physicsRaw = safeString(payloadObject.physics);
  const lenguaRaw = safeString(payloadObject.lengua);
  const aiRaw = safeString(payloadObject.aiChat);

  const mathConversion = convertMathAstToPlainText(mathRaw);

  const sections: string[] = [];
  if (mathConversion.text.trim()) sections.push(`Math\n${mathConversion.text.trim()}`);
  if (physicsRaw.trim()) sections.push(`Physics\n${physicsRaw.trim()}`);
  if (lenguaRaw.trim()) sections.push(`Lengua\n${lenguaRaw.trim()}`);
  if (aiRaw.trim()) sections.push(`AI Chat\n${aiRaw.trim()}`);

  const textToAppend = sections.join("\n\n") + (sections.length > 0 ? "\n" : "");

  return {
    textToAppend,
    usedEquationFallback: mathConversion.usedFallback,
  };
}

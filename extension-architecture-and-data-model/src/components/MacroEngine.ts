import {
  createDerivativeNode,
  createFractionNode,
  createGroupNode,
  createIntegralNode,
  createLimitNode,
  createPowerNode,
  createRootNode,
  createSubscriptNode,
  createVectorNode,
  type MathEditorMode,
  type MathNode,
} from "./MathAST";

type TextMacroMode = "physics" | "lengua";

interface MacroMatch {
  token: string;
  start: number;
  end: number;
}

interface TextMacroResult {
  applied: boolean;
  nextText: string;
  nextCaret: number;
}

const PHYSICS_TEXT_MACROS: Record<string, string> = {
  "\\vec": "vector()",
  "\\si": "[SI: ]",
  "\\int": "∫",
  "\\ohm": "Ω",
  "\\mps": "m/s",
};

const LENGUA_TEXT_MACROS: Record<string, string> = {
  "\\a": "á",
  "\\e": "é",
  "\\i": "í",
  "\\o": "ó",
  "\\u": "ú",
  "\\n": "ñ",
  "\\dia": "ü",
  "\\abrirpreg": "¿",
  "\\abrirexcl": "¡",
};

export function findMacroBeforeCaret(text: string, caretIndex: number): MacroMatch | null {
  const left = text.slice(0, caretIndex);
  const match = left.match(/\\[a-zA-Z]+$/);

  if (!match || typeof match.index !== "number") {
    return null;
  }

  return {
    token: match[0],
    start: match.index,
    end: caretIndex,
  };
}

function getTextReplacement(mode: TextMacroMode, token: string): string | null {
  if (mode === "physics") {
    return PHYSICS_TEXT_MACROS[token] ?? null;
  }

  return LENGUA_TEXT_MACROS[token] ?? null;
}

export function applyTextMacroOnSpace(params: {
  mode: TextMacroMode;
  text: string;
  caretIndex: number;
}): TextMacroResult {
  const match = findMacroBeforeCaret(params.text, params.caretIndex);

  if (!match) {
    return {
      applied: false,
      nextText: params.text,
      nextCaret: params.caretIndex,
    };
  }

  const replacement = getTextReplacement(params.mode, match.token);
  if (!replacement) {
    return {
      applied: false,
      nextText: params.text,
      nextCaret: params.caretIndex,
    };
  }

  const nextText = `${params.text.slice(0, match.start)}${replacement} ${params.text.slice(match.end)}`;
  const nextCaret = match.start + replacement.length + 1;

  return {
    applied: true,
    nextText,
    nextCaret,
  };
}

export function resolveMathMacro(token: string, mode: MathEditorMode): MathNode | null {
  const normalized = token.trim();

  if (normalized === "\\frac") {
    return createFractionNode();
  }

  if (normalized === "\\der") {
    return createDerivativeNode();
  }

  if (normalized === "\\vec") {
    return createVectorNode();
  }

  if (normalized === "\\lim") {
    return createLimitNode();
  }

  if (normalized === "\\pow" || normalized === "\\sup") {
    return createPowerNode();
  }

  if (normalized === "\\sub") {
    return createSubscriptNode();
  }

  if (normalized === "\\sqrt" || normalized === "\\root") {
    return createRootNode();
  }

  if (normalized === "\\paren") {
    return createGroupNode();
  }

  if (mode === "physics" && (normalized === "\\int" || normalized === "\\integral")) {
    return createIntegralNode();
  }

  return null;
}

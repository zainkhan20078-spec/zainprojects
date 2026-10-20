const FORBIDDEN_PHRASES = [
  "as an ai language model",
  "here is the summary you requested",
  "in summary, it is important to note",
  "as an ai",
];

function stripForbiddenPhrases(text: string): string {
  let next = text;
  for (const phrase of FORBIDDEN_PHRASES) {
    const pattern = new RegExp(phrase, "gi");
    next = next.replace(pattern, "");
  }
  return next;
}

function normalizeOpeners(text: string): string {
  return text
    .replace(/^\s*(sure|of course|absolutely|certainly)[,\s:!-]*/i, "")
    .replace(/^\s*(here\s*(is|are)|let'?s)\b[^\n]*\n?/i, "")
    .replace(/^[.,;:]+/, "")
    .trim();
}

function tightenSpacing(text: string): string {
  return text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function enforceHumanStyle(text: string): string {
  const noForbidden = stripForbiddenPhrases(text);
  const noOpeners = normalizeOpeners(noForbidden);
  const tightened = tightenSpacing(noOpeners);
  return tightened || text.trim();
}

export async function applyStylePass(
  rawText: string,
  modelStyleCall?: (prompt: string) => Promise<string>,
): Promise<string> {
  if (!modelStyleCall) {
    return enforceHumanStyle(rawText);
  }

  const prompt = [
    "Rewrite the following study notes so they sound natural and human.",
    "Hard rules:",
    "- Never mention being an AI.",
    "- No robotic intros.",
    "- No formulaic conclusions.",
    "- Start directly with useful notes.",
    "Text:",
    rawText,
  ].join("\n");

  try {
    const modelOutput = await modelStyleCall(prompt);
    return enforceHumanStyle(modelOutput);
  } catch {
    return enforceHumanStyle(rawText);
  }
}

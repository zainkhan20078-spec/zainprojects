import { type DocumentAction, type DocumentBlueprint, normalizeDocName, type WriteStyle } from "./documentBlueprint";

export interface ParsedNaturalCommand {
  blueprint: DocumentBlueprint;
  cleanedInstruction: string;
}

function extractQuotedName(prompt: string): string | null {
  const quoted = prompt.match(/['"]([^'"]{2,120})['"]/);
  return quoted ? quoted[1] : null;
}

function inferAction(prompt: string): DocumentAction {
  const lower = prompt.toLowerCase();

  if (/(new doc|create.*doc|new document)/.test(lower)) {
    return "CREATE_NEW_DOC";
  }

  if (/(overwrite|replace all|rewrite the whole|from scratch)/.test(lower)) {
    return "OVERWRITE_EXISTING";
  }

  return "APPEND_TO_EXISTING";
}

function inferStyle(prompt: string): WriteStyle {
  return /human\s*speed|typewriter|slowly/i.test(prompt) ? "HUMAN_SPEED" : "INSTANT";
}

function inferTargetName(prompt: string): string {
  const quoted = extractQuotedName(prompt);
  if (quoted) {
    return normalizeDocName(quoted);
  }

  const match = prompt.match(/(?:into|in|to|edit)\s+the\s+([a-zA-Z0-9\s_-]{2,80})\s+(?:doc|document|notebook)/i);
  if (match?.[1]) {
    return normalizeDocName(match[1]);
  }

  return "Current Notebook";
}

function inferSectionHeading(prompt: string): string | undefined {
  const match = prompt.match(/(?:to|under|into)\s+the\s+([a-zA-Z0-9\s_-]{2,80})\s+section/i);
  if (!match?.[1]) {
    return undefined;
  }

  return normalizeDocName(match[1]);
}

function stripCommandScaffolding(prompt: string): string {
  let next = prompt;

  const patterns = [
    /put this in a new doc called ['"][^'"]+['"]\.?/gi,
    /edit the existing ['"][^'"]+['"] doc and add this to the bottom\.?/gi,
    /type this into the ['"][^'"]+['"] doc but add my dyslexia typos at human speed\.?/gi,
  ];

  for (const pattern of patterns) {
    next = next.replace(pattern, "");
  }

  return next.trim();
}

export function parseNaturalCommand(prompt: string): ParsedNaturalCommand {
  const targetName = inferTargetName(prompt);
  const action = inferAction(prompt);
  const style = inferStyle(prompt);
  const sectionHeading = inferSectionHeading(prompt);
  const addDyslexiaTypos = /dyslexia\s+typos|with\s+typos|inject\s+typos/i.test(prompt);
  const highlightImportant = /highlight\s+(?:what\s+(?:you\s+think\s+)?is\s+)?important/i.test(prompt);
  const cleanedInstruction = stripCommandScaffolding(prompt) || prompt;

  return {
    blueprint: {
      action,
      targetName,
      style,
      addDyslexiaTypos,
      highlightImportant,
      sectionHeading,
      sourcePrompt: prompt,
    },
    cleanedInstruction,
  };
}

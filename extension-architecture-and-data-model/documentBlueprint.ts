export type DocumentAction = "CREATE_NEW_DOC" | "APPEND_TO_EXISTING" | "OVERWRITE_EXISTING";
export type WriteStyle = "HUMAN_SPEED" | "INSTANT";

export interface HighlightDirective {
  start: number;
  end: number;
  color: "yellow" | "lightBlue";
  reason: "definition" | "formula";
}

export interface DocumentBlueprint {
  action: DocumentAction;
  targetName: string;
  style: WriteStyle;
  addDyslexiaTypos: boolean;
  highlightImportant: boolean;
  sectionHeading?: string;
  sourcePrompt: string;
}

const DEFINITION_HINTS = ["is defined as", "means", "definition", "key idea", "important", "remember"];

function splitSentencesWithOffsets(text: string): Array<{ text: string; start: number; end: number }> {
  const spans: Array<{ text: string; start: number; end: number }> = [];
  const regex = /[^.!?\n]+[.!?]?|\n/g;
  let match = regex.exec(text);

  while (match) {
    const sentence = match[0];
    if (sentence.trim() && sentence !== "\n") {
      spans.push({
        text: sentence,
        start: match.index,
        end: match.index + sentence.length,
      });
    }
    match = regex.exec(text);
  }

  return spans;
}

function isFormulaLike(text: string): boolean {
  return /[=^_]|\b\d+\b|\b(?:integral|lim|vector|dx|m\/s|kg|newton|joule)\b/i.test(text);
}

function isDefinitionLike(text: string): boolean {
  const lowered = text.toLowerCase();
  return DEFINITION_HINTS.some((hint) => lowered.includes(hint));
}

export function buildHighlightDirectives(text: string): HighlightDirective[] {
  const directives: HighlightDirective[] = [];
  const spans = splitSentencesWithOffsets(text);

  for (const span of spans) {
    if (isFormulaLike(span.text)) {
      directives.push({
        start: span.start,
        end: span.end,
        color: "lightBlue",
        reason: "formula",
      });
      continue;
    }

    if (isDefinitionLike(span.text)) {
      directives.push({
        start: span.start,
        end: span.end,
        color: "yellow",
        reason: "definition",
      });
    }
  }

  return directives;
}

export function normalizeDocName(input: string): string {
  return (
    input
      .trim()
      .replace(/^['"]|['"]$/g, "")
      .slice(0, 120) || "Untitled Notes"
  );
}

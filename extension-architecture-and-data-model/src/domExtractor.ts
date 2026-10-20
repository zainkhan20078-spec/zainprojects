export type InteractiveRole = "input" | "button" | "link" | "select" | "textarea" | "checkbox" | "other";

export interface InteractiveElement {
  id: string;
  role: InteractiveRole;
  selector: string;
  text: string;
  placeholder?: string;
  ariaLabel?: string;
  disabled: boolean;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AgentPageSnapshot {
  url: string;
  title: string;
  interactiveMap: InteractiveElement[];
}

const DESTRUCTIVE_WORDS = ["delete", "remove", "cancel", "purchase", "buy", "checkout", "drop"];

export function classifyRole(tagName: string, type: string | undefined): InteractiveRole {
  const tag = tagName.toLowerCase();
  const inputType = (type ?? "").toLowerCase();

  if (tag === "button") return "button";
  if (tag === "a") return "link";
  if (tag === "select") return "select";
  if (tag === "textarea") return "textarea";
  if (tag === "input" && inputType === "checkbox") return "checkbox";
  if (tag === "input") return "input";
  return "other";
}

export function summarizeInteractiveMap(elements: InteractiveElement[], max = 30): string {
  return elements
    .slice(0, max)
    .map((element, index) => {
      const label = [element.text, element.placeholder, element.ariaLabel].filter(Boolean).join(" | ");
      return `${index + 1}. [${element.role}] selector=${element.selector} label=${label || "(none)"}`;
    })
    .join("\n");
}

export function isDestructiveActionLabel(label: string): boolean {
  const lower = label.toLowerCase();
  return DESTRUCTIVE_WORDS.some((word) => lower.includes(word));
}

export function findBestElementByHint(elements: InteractiveElement[], hint: string): InteractiveElement | null {
  const target = hint.trim().toLowerCase();
  if (!target) {
    return null;
  }

  const candidates = elements
    .filter((element) => element.visible && !element.disabled)
    .map((element) => {
      const scoreSource = [element.text, element.placeholder, element.ariaLabel, element.selector]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      let score = 0;
      if (scoreSource.includes(target)) score += 8;
      const targetTokens = target.split(/\s+/).filter(Boolean);
      for (const token of targetTokens) {
        if (scoreSource.includes(token)) score += 2;
      }

      return { element, score };
    })
    .sort((a, b) => b.score - a.score);

  return candidates[0] && candidates[0].score > 0 ? candidates[0].element : null;
}

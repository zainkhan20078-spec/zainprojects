import { db, type ErrorPattern, type ErrorProfile } from "./db";
import { joinTokens, tokenizeWithProtectedSpans } from "./protectedSpans";

export interface MistakeEngineRunOptions {
  profileId: number;
  text: string;
  intensity?: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyPatternToToken(token: string, pattern: ErrorPattern): string {
  if (!pattern.original) {
    return token;
  }

  const boundary = /[a-zA-Z]/.test(pattern.original) ? "\\b" : "";
  const expression = new RegExp(`${boundary}${escapeRegExp(pattern.original)}${boundary}`, "gi");
  return token.replace(expression, pattern.corrupted);
}

function shouldApplyPattern(intensity: number): boolean {
  return Math.random() < intensity;
}

export async function getErrorProfiles(): Promise<ErrorProfile[]> {
  return db.errorProfiles.toArray();
}

export async function ensureDefaultErrorProfile(): Promise<number> {
  const existing = await db.errorProfiles.orderBy("id").first();
  if (existing?.id) {
    return existing.id;
  }

  const defaultId = await db.errorProfiles.add({
    name: "Base Dyslexia Practice",
    patterns: [
      { original: "t", corrupted: "tt", type: "double-consonant" },
      { original: "quite", corrupted: "quitee", type: "ending-repeat" },
      { original: "and", corrupted: "annd", type: "consonant-repeat" },
      { original: "que", corrupted: "quee", type: "vowel-repeat" },
    ],
  });

  return defaultId;
}

export async function applyMistakeProfile(options: MistakeEngineRunOptions): Promise<string> {
  const profile = await db.errorProfiles.get(options.profileId);
  if (!profile) {
    throw new Error("Error profile not found.");
  }

  const intensity = Math.min(Math.max(options.intensity ?? 0.45, 0), 1);
  const tokens = tokenizeWithProtectedSpans(options.text);

  const transformed = tokens.map((token) => {
    if (token.protected) {
      return token;
    }

    let nextValue = token.value;
    for (const pattern of profile.patterns) {
      if (!shouldApplyPattern(intensity)) {
        continue;
      }
      nextValue = applyPatternToToken(nextValue, pattern);
    }

    return {
      ...token,
      value: nextValue,
    };
  });

  return joinTokens(transformed);
}

export interface TextToken {
  value: string;
  protected: boolean;
}

const URL_PATTERN = /https?:\/\/[^\s]+|www\.[^\s]+/i;
const NUMBER_PATTERN = /^[-+]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?$/;
const ACCENT_PATTERN = /[áéíóúÁÉÍÓÚñÑüÜ]/;
const FORMULA_SYMBOL_PATTERN = /[=+\-*/^_<>%]|\b(?:sin|cos|tan|log|ln|dx|m\/s|kg|N|J|V|A)\b/i;

function splitByWhitespaceKeepingDelimiters(text: string): string[] {
  return text.split(/(\s+)/).filter((part) => part.length > 0);
}

function isEquationLike(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) {
    return false;
  }

  if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("(") && trimmed.endsWith(")"))) {
    if (FORMULA_SYMBOL_PATTERN.test(trimmed)) {
      return true;
    }
  }

  return FORMULA_SYMBOL_PATTERN.test(trimmed);
}

export function shouldProtectToken(rawToken: string): boolean {
  const token = rawToken.trim();
  if (!token) {
    return true;
  }

  if (URL_PATTERN.test(token)) {
    return true;
  }

  if (NUMBER_PATTERN.test(token)) {
    return true;
  }

  if (ACCENT_PATTERN.test(token)) {
    return true;
  }

  if (isEquationLike(token)) {
    return true;
  }

  return false;
}

export function tokenizeWithProtectedSpans(text: string): TextToken[] {
  const parts = splitByWhitespaceKeepingDelimiters(text);
  return parts.map((part) => {
    if (/^\s+$/.test(part)) {
      return {
        value: part,
        protected: true,
      };
    }

    return {
      value: part,
      protected: shouldProtectToken(part),
    };
  });
}

export function joinTokens(tokens: TextToken[]): string {
  return tokens.map((token) => token.value).join("");
}

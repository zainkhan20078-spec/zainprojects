import { describe, expect, it } from "vitest";
import { joinTokens, shouldProtectToken, tokenizeWithProtectedSpans } from "../protectedSpans";

describe("shouldProtectToken", () => {
  it("protects URLs", () => {
    expect(shouldProtectToken("https://example.com/page")).toBe(true);
    expect(shouldProtectToken("www.example.com")).toBe(true);
  });

  it("protects numbers including decimals and exponents", () => {
    expect(shouldProtectToken("42")).toBe(true);
    expect(shouldProtectToken("3.14")).toBe(true);
    expect(shouldProtectToken("-1,5")).toBe(true);
    expect(shouldProtectToken("1e-3")).toBe(true);
  });

  it("protects accented words", () => {
    expect(shouldProtectToken("cámara")).toBe(true);
    expect(shouldProtectToken("Álgebra")).toBe(true);
  });

  it("protects equation-like tokens", () => {
    expect(shouldProtectToken("x=5")).toBe(true);
    expect(shouldProtectToken("a/b")).toBe(true);
    expect(shouldProtectToken("v^2")).toBe(true);
    expect(shouldProtectToken("[m/s]")).toBe(true);
  });

  it("does not protect plain words or whitespace", () => {
    expect(shouldProtectToken("casa")).toBe(false);
    expect(shouldProtectToken("table")).toBe(false);
    expect(shouldProtectToken("   ")).toBe(true);
  });
});

describe("tokenizeWithProtectedSpans", () => {
  it("keeps whitespace tokens and marks them protected", () => {
    const tokens = tokenizeWithProtectedSpans("hello world");
    expect(tokens.map((token) => token.value)).toEqual(["hello", " ", "world"]);
    expect(tokens[1].protected).toBe(true);
    expect(tokens[0].protected).toBe(false);
  });

  it("marks URLs and numbers as protected in flowing text", () => {
    const tokens = tokenizeWithProtectedSpans("see https://example.com for 42 reasons");
    const urlToken = tokens.find((token) => token.value === "https://example.com");
    const numberToken = tokens.find((token) => token.value === "42");
    expect(urlToken?.protected).toBe(true);
    expect(numberToken?.protected).toBe(true);
  });
});

describe("joinTokens", () => {
  it("rebuilds the original text exactly", () => {
    const text = "Velocidad v = 25 m/s en 3,5 s ver https://example.com";
    expect(joinTokens(tokenizeWithProtectedSpans(text))).toBe(text);
  });
});

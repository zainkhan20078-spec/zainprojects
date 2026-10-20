import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db";
import { generateWithProvider } from "../aiRouter";
import { saveApiKey } from "../keyPool";
import { installChromeStorageMock, removeChromeMock } from "./helpers/chromeStorageMock";
import { resetDb } from "./helpers/resetDb";

const originalFetch = globalThis.fetch;

beforeEach(async () => {
  installChromeStorageMock();
  await resetDb();
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  removeChromeMock();
});

async function seedProvider(params: {
  name: string;
  baseUrl: string;
  models: string[];
  protocol: "gemini" | "openai-compatible";
  apiKey: string;
}): Promise<number> {
  const providerId = await db.aiProviders.add({
    name: params.name,
    baseUrl: params.baseUrl,
    models: params.models,
    protocol: params.protocol,
  });
  await saveApiKey({ providerId, key: params.apiKey });
  return providerId;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("generateWithProvider", () => {
  it("calls OpenAI-compatible endpoints and returns the message content", async () => {
    await seedProvider({
      name: "TestOAI",
      baseUrl: "https://api.test.example/v1",
      models: ["model-a"],
      protocol: "openai-compatible",
      apiKey: "sk-test",
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: "Paris is the capital." } }] }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = (await db.aiProviders.toArray())[0];
    const result = await generateWithProvider(provider, "Capital of France?");

    expect(result.text).toBe("Paris is the capital.");
    expect(result.routeTaken).toBe("direct:TestOAI:model-a");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.test.example/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(JSON.parse(String(init.body)).messages[0].content).toContain("Capital of France?");
  });

  it("adapts requests to the Gemini protocol", async () => {
    await seedProvider({
      name: "GeminiTest",
      baseUrl: "https://gemini.test.example/v1beta",
      models: ["gemini-mini"],
      protocol: "gemini",
      apiKey: "g-key",
    });

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "Part one. " }, { text: "Part two." }] } }],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = (await db.aiProviders.toArray())[0];
    const result = await generateWithProvider(provider, "Summarise");

    expect(result.text).toBe("Part one.  Part two.");
    expect(result.routeTaken).toBe("direct:GeminiTest:gemini-mini");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gemini.test.example/v1beta/models/gemini-mini:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("g-key");
  });

  it("cools a key down after a 429 and reports that no key is available", async () => {
    await seedProvider({
      name: "RateLimited",
      baseUrl: "https://api.test.example/v1",
      models: ["model-a"],
      protocol: "openai-compatible",
      apiKey: "sk-limited",
    });

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "rate limited" }, 429)) as unknown as typeof fetch;

    const provider = (await db.aiProviders.toArray())[0];
    await expect(generateWithProvider(provider, "Anything")).rejects.toThrow();

    const key = await db.apiKeys.toArray();
    expect(key[0].cooldownUntil).not.toBeNull();
    expect(key[0].cooldownUntil!).toBeGreaterThan(Date.now());

    await expect(generateWithProvider(provider, "Anything")).rejects.toThrow("No available API key");
  });

  it("prefixes notebook context onto the prompt", async () => {
    await seedProvider({
      name: "CtxOAI",
      baseUrl: "https://api.test.example/v1",
      models: ["model-a"],
      protocol: "openai-compatible",
      apiKey: "sk-ctx",
    });

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "ok" } }] }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = (await db.aiProviders.toArray())[0];
    await generateWithProvider(provider, "Explain", "thermodynamics notes");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(String(init.body)).messages[0].content as string;
    expect(sent).toContain("Notebook context:");
    expect(sent).toContain("thermodynamics notes");
    expect(sent).toContain("Task:");
  });
});

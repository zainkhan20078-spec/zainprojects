import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGoogleSearchEngineId, saveGoogleSearchConfig, searchGoogleWeb } from "../googleSearch";
import { installChromeStorageMock, removeChromeMock } from "./helpers/chromeStorageMock";

beforeEach(() => {
  installChromeStorageMock();
});

afterEach(() => {
  removeChromeMock();
  vi.unstubAllGlobals();
});

describe("Google Programmable Search", () => {
  it("requires both settings before saving", async () => {
    await expect(saveGoogleSearchConfig("  ", "engine-id")).rejects.toThrow("Enter your Google Custom Search API key.");
    await expect(saveGoogleSearchConfig("api-key", "  ")).rejects.toThrow("Enter your Programmable Search Engine ID.");
  });

  it("stores the API key encrypted and can read the engine ID", async () => {
    const storage = installChromeStorageMock();
    await saveGoogleSearchConfig("  private-key  ", "engine-id");

    const saved = storage.get("googleProgrammableSearchConfigV1") as {
      encryptedApiKey: string;
      searchEngineId: string;
    };
    expect(saved.encryptedApiKey).toMatch(/^enc:v1:/);
    expect(saved.encryptedApiKey).not.toContain("private-key");
    expect(saved.searchEngineId).toBe("engine-id");
    await expect(getGoogleSearchEngineId()).resolves.toBe("engine-id");
  });

  it("searches with saved settings, limits results, and filters unsafe/malformed links", async () => {
    await saveGoogleSearchConfig("private-key", "engine-id");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            { title: "Valid result", link: "https://example.com/page", snippet: "A result." },
            { title: "Unsafe result", link: "javascript:alert(1)", snippet: "Unsafe." },
            { title: "Malformed result", link: "not a URL", snippet: "Malformed." },
            { title: "Incomplete result", link: "https://example.com", snippet: 3 },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const results = await searchGoogleWeb("  integration test  ", 50);
    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);

    expect(requestUrl.searchParams.get("key")).toBe("private-key");
    expect(requestUrl.searchParams.get("cx")).toBe("engine-id");
    expect(requestUrl.searchParams.get("q")).toBe("integration test");
    expect(requestUrl.searchParams.get("num")).toBe("10");
    expect(results).toEqual([{ title: "Valid result", link: "https://example.com/page", snippet: "A result." }]);
  });

  it("reports missing setup and Google API errors", async () => {
    await expect(searchGoogleWeb("a query")).rejects.toThrow(
      "Add and save a Google Search API key and Search Engine ID first.",
    );

    await saveGoogleSearchConfig("private-key", "engine-id");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { message: "API key is invalid." } }), { status: 403 }),
        ),
    );
    await expect(searchGoogleWeb("a query")).rejects.toThrow("API key is invalid.");
  });
});

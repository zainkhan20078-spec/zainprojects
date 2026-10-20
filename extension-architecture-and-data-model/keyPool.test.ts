import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, type AIProvider } from "../db";
import {
  acquireKey,
  addCustomProvider,
  deleteApiKey,
  listKeysForProvider,
  listProviders,
  markKeyRateLimited,
  markKeyUsed,
  saveApiKey,
} from "../keyPool";
import { installChromeStorageMock, removeChromeMock } from "./helpers/chromeStorageMock";
import { resetDb } from "./helpers/resetDb";

beforeEach(async () => {
  installChromeStorageMock();
  await resetDb();
});

afterEach(async () => {
  removeChromeMock();
});

async function addProvider(overrides: Partial<AIProvider> = {}): Promise<AIProvider> {
  const id = await db.aiProviders.add({
    name: overrides.name ?? "TestProvider",
    baseUrl: overrides.baseUrl ?? "https://api.test.example/v1",
    models: overrides.models ?? ["model-a"],
    protocol: overrides.protocol ?? "openai-compatible",
  });
  return {
    id,
    name: overrides.name ?? "TestProvider",
    baseUrl: overrides.baseUrl ?? "https://api.test.example/v1",
    models: overrides.models ?? ["model-a"],
    protocol: overrides.protocol ?? "openai-compatible",
  };
}

describe("API key encryption at rest", () => {
  it("stores only encrypted key material and decrypts on acquire", async () => {
    const provider = await addProvider();
    await saveApiKey({ providerId: provider.id!, key: "sk-super-secret" });

    const rows = await listKeysForProvider(provider.id!);
    expect(rows).toHaveLength(1);
    expect(rows[0].key.startsWith("enc:v1:")).toBe(true);
    expect(rows[0].key).not.toContain("sk-super-secret");

    const acquired = await acquireKey(provider.id!);
    expect(acquired?.plainKey).toBe("sk-super-secret");
    expect(acquired?.row.id).toBe(rows[0].id);
  });

  it("keeps unique IVs so the same key encrypts to different ciphertexts", async () => {
    const provider = await addProvider();
    await saveApiKey({ providerId: provider.id!, key: "sk-duplicate" });
    await saveApiKey({ providerId: provider.id!, key: "sk-duplicate" });

    const rows = await listKeysForProvider(provider.id!);
    expect(rows[0].key).not.toBe(rows[1].key);
  });

  it("rotates to the least recently used key", async () => {
    const provider = await addProvider();
    const firstId = await saveApiKey({ providerId: provider.id!, key: "sk-first" });
    const secondId = await saveApiKey({ providerId: provider.id!, key: "sk-second" });

    const first = await acquireKey(provider.id!);
    expect(first?.row.id).toBe(firstId);
    await markKeyUsed(firstId);

    const second = await acquireKey(provider.id!);
    expect(second?.row.id).toBe(secondId);
    expect(second?.plainKey).toBe("sk-second");
  });

  it("skips keys that are cooling down after a rate limit", async () => {
    const provider = await addProvider();
    await saveApiKey({ providerId: provider.id!, key: "sk-only" });

    const only = await acquireKey(provider.id!);
    await markKeyRateLimited(only!.row.id!, 60_000);

    expect(await acquireKey(provider.id!)).toBeNull();

    await db.apiKeys.update(only!.row.id!, { cooldownUntil: Date.now() - 1 });
    expect((await acquireKey(provider.id!))?.plainKey).toBe("sk-only");
  });

  it("deletes keys", async () => {
    const provider = await addProvider();
    const keyId = await saveApiKey({ providerId: provider.id!, key: "sk-temp" });
    await deleteApiKey(keyId);
    expect(await listKeysForProvider(provider.id!)).toHaveLength(0);
  });
});

describe("addCustomProvider validation", () => {
  it("rejects an empty name", async () => {
    await expect(addCustomProvider({ name: "  ", baseUrl: "https://api.example.com", models: ["m"] })).rejects.toThrow(
      "Enter a provider name.",
    );
  });

  it("rejects a base URL that is not a valid URL", async () => {
    await expect(addCustomProvider({ name: "Broken", baseUrl: "not-a-url", models: ["m"] })).rejects.toThrow(
      "valid API base URL",
    );
  });

  it("rejects plain HTTP for remote hosts but allows localhost", async () => {
    await expect(
      addCustomProvider({ name: "Insecure", baseUrl: "http://api.example.com/v1", models: ["m"] }),
    ).rejects.toThrow("Use HTTPS for remote API providers");

    await expect(
      addCustomProvider({ name: "Local", baseUrl: "http://localhost:1234/v1", models: ["m"] }),
    ).resolves.toBeGreaterThan(0);
  });

  it("rejects models-less providers and duplicate names", async () => {
    await expect(
      addCustomProvider({ name: "NoModels", baseUrl: "https://api.example.com", models: ["  "] }),
    ).rejects.toThrow("at least one model");

    await addCustomProvider({ name: "Unique", baseUrl: "https://api.example.com", models: ["m"] });
    await expect(
      addCustomProvider({ name: "unique", baseUrl: "https://api.example.com", models: ["m"] }),
    ).rejects.toThrow("already exists");
  });
});

describe("default providers", () => {
  it("seeds Gemini, Groq and OpenRouter exactly once", async () => {
    const first = await listProviders();
    const names = first.map((provider) => provider.name);
    expect(names).toEqual(expect.arrayContaining(["Gemini", "Groq", "OpenRouter"]));

    await listProviders();
    const second = await db.aiProviders.toArray();
    expect(second).toHaveLength(first.length);
  });
});

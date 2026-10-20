import { db, type AIProvider, type ApiKey } from "./db";

const STORAGE_MASTER_KEY = "aiKeyPoolMasterKeyV1";
const DEFAULT_RATE_LIMIT = 60;
const DEFAULT_COOLDOWN_MS = 90_000;

interface DecryptedApiKey {
  row: ApiKey;
  plainKey: string;
}

const DEFAULT_PROVIDERS: Array<Omit<AIProvider, "id">> = [
  {
    name: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"],
    protocol: "gemini",
  },
  {
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile", "qwen/qwen3-32b"],
    protocol: "openai-compatible",
  },
  {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    models: ["google/gemini-flash-1.5", "deepseek/deepseek-r1:free"],
    protocol: "openai-compatible",
  },
];

function toBase64(bytes: Uint8Array): string {
  let value = "";
  for (let index = 0; index < bytes.length; index += 1) {
    value += String.fromCharCode(bytes[index]);
  }
  return btoa(value);
}

function fromBase64(input: string): Uint8Array {
  const raw = atob(input);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

async function getStorageValue(key: string): Promise<string | null> {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    const result = await chrome.storage.local.get(key);
    return (result[key] as string | undefined) ?? null;
  }

  return localStorage.getItem(key);
}

async function setStorageValue(key: string, value: string): Promise<void> {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }

  localStorage.setItem(key, value);
}

async function getOrCreateMasterKey(): Promise<CryptoKey> {
  const existing = await getStorageValue(STORAGE_MASTER_KEY);
  if (existing) {
    const rawBytes = fromBase64(existing);
    return crypto.subtle.importKey("raw", toArrayBuffer(rawBytes), "AES-GCM", true, ["encrypt", "decrypt"]);
  }

  const raw = crypto.getRandomValues(new Uint8Array(32));
  await setStorageValue(STORAGE_MASTER_KEY, toBase64(raw));
  return crypto.subtle.importKey("raw", toArrayBuffer(raw), "AES-GCM", true, ["encrypt", "decrypt"]);
}

async function encryptText(plainText: string): Promise<string> {
  const key = await getOrCreateMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plainText));

  return `enc:v1:${toBase64(iv)}:${toBase64(new Uint8Array(encrypted))}`;
}

async function decryptText(cipherText: string): Promise<string> {
  if (!cipherText.startsWith("enc:v1:")) {
    return cipherText;
  }

  const [, , ivB64, payloadB64] = cipherText.split(":");
  if (!ivB64 || !payloadB64) {
    throw new Error("Invalid encrypted API key payload.");
  }

  const key = await getOrCreateMasterKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(toArrayBuffer(fromBase64(ivB64))) },
    key,
    toArrayBuffer(fromBase64(payloadB64)),
  );

  return new TextDecoder().decode(plain);
}

export async function encryptLocalSecret(value: string): Promise<string> {
  return encryptText(value);
}

export async function decryptLocalSecret(value: string): Promise<string> {
  return decryptText(value);
}

export async function ensureDefaultProviders(): Promise<AIProvider[]> {
  await db.transaction("rw", [db.aiProviders, db.apiKeys], async () => {
    const existing = await db.aiProviders.toArray();
    const canonicalByName = new Map<string, AIProvider>();

    for (const provider of existing) {
      const normalizedName = provider.name.trim().toLowerCase();
      const canonical = canonicalByName.get(normalizedName);
      if (!canonical) {
        canonicalByName.set(normalizedName, provider);
      } else if (canonical.id && provider.id) {
        await db.apiKeys.where("providerId").equals(provider.id).modify({ providerId: canonical.id });
        await db.aiProviders.delete(provider.id);
      }
    }

    const missingDefaults = DEFAULT_PROVIDERS.filter(
      (provider) => !canonicalByName.has(provider.name.trim().toLowerCase()),
    );
    if (missingDefaults.length > 0) {
      await db.aiProviders.bulkAdd(missingDefaults);
    }
  });

  return db.aiProviders.toArray();
}

export async function listProviders(): Promise<AIProvider[]> {
  await ensureDefaultProviders();
  return db.aiProviders.toArray();
}

export async function addCustomProvider(params: { name: string; baseUrl: string; models: string[] }): Promise<number> {
  const name = params.name.trim();
  const baseUrl = params.baseUrl.trim().replace(/\/+$/, "");
  const models = Array.from(new Set(params.models.map((model) => model.trim()).filter(Boolean)));

  if (!name) {
    throw new Error("Enter a provider name.");
  }
  if (!models.length) {
    throw new Error("Enter at least one model name.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new Error("Enter a valid API base URL.");
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("The API base URL must use HTTPS or HTTP.");
  }
  if (parsedUrl.protocol === "http:" && parsedUrl.hostname !== "localhost" && parsedUrl.hostname !== "127.0.0.1") {
    throw new Error("Use HTTPS for remote API providers.");
  }

  const existing = await db.aiProviders.toArray();
  if (existing.some((provider) => provider.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new Error("A provider with this name already exists.");
  }

  return db.aiProviders.add({
    name,
    baseUrl,
    models,
    protocol: "openai-compatible",
  });
}

export async function saveApiKey(params: { providerId: number; key: string; rateLimit?: number }): Promise<number> {
  const encryptedKey = await encryptText(params.key.trim());

  return db.apiKeys.add({
    providerId: params.providerId,
    key: encryptedKey,
    rateLimit: params.rateLimit ?? DEFAULT_RATE_LIMIT,
    lastUsed: null,
    cooldownUntil: null,
  });
}

export async function listKeysForProvider(providerId: number): Promise<ApiKey[]> {
  return db.apiKeys.where("providerId").equals(providerId).toArray();
}

export async function deleteApiKey(keyId: number): Promise<void> {
  await db.apiKeys.delete(keyId);
}

function isCoolingDown(row: ApiKey, now: number): boolean {
  return typeof row.cooldownUntil === "number" && row.cooldownUntil > now;
}

export async function acquireKey(providerId: number): Promise<DecryptedApiKey | null> {
  const now = Date.now();
  const keys = await db.apiKeys.where("providerId").equals(providerId).toArray();
  const available = keys
    .filter((row) => !isCoolingDown(row, now))
    .sort((a, b) => (a.lastUsed ?? 0) - (b.lastUsed ?? 0));

  const selected = available[0];
  if (!selected) {
    return null;
  }

  return {
    row: selected,
    plainKey: await decryptText(selected.key),
  };
}

export async function markKeyUsed(keyId: number): Promise<void> {
  await db.apiKeys.update(keyId, {
    lastUsed: Date.now(),
    cooldownUntil: null,
  });
}

export async function markKeyRateLimited(keyId: number, cooldownMs = DEFAULT_COOLDOWN_MS): Promise<void> {
  await db.apiKeys.update(keyId, {
    cooldownUntil: Date.now() + cooldownMs,
  });
}

export async function getProviderByName(name: string): Promise<AIProvider | undefined> {
  await ensureDefaultProviders();
  const providers = await db.aiProviders.toArray();
  return providers.find((provider) => provider.name.toLowerCase() === name.toLowerCase());
}

export class ProviderRegistry {
  private providers: AIProvider[] = [];

  async load(): Promise<void> {
    this.providers = await listProviders();
  }

  getAll(): AIProvider[] {
    return this.providers;
  }

  getByName(name: string): AIProvider | undefined {
    return this.providers.find((provider) => provider.name.toLowerCase() === name.toLowerCase());
  }

  getFirstAvailable(): AIProvider | undefined {
    return this.providers[0];
  }
}

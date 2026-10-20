import { decryptLocalSecret, encryptLocalSecret } from "./keyPool";

const STORAGE_KEY = "googleProgrammableSearchConfigV1";
const API_ENDPOINT = "https://www.googleapis.com/customsearch/v1";

interface StoredGoogleSearchConfig {
  encryptedApiKey: string;
  searchEngineId: string;
}

export interface GoogleWebSearchResult {
  title: string;
  link: string;
  snippet: string;
}

interface GoogleSearchResponse {
  items?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
  }>;
  error?: {
    message?: string;
  };
}

function isHttpUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export async function saveGoogleSearchConfig(apiKey: string, searchEngineId: string): Promise<void> {
  const trimmedApiKey = apiKey.trim();
  const trimmedEngineId = searchEngineId.trim();
  if (!trimmedApiKey) {
    throw new Error("Enter your Google Custom Search API key.");
  }
  if (!trimmedEngineId) {
    throw new Error("Enter your Programmable Search Engine ID.");
  }
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    throw new Error("Save search settings from the installed Chrome extension.");
  }

  const encryptedApiKey = await encryptLocalSecret(trimmedApiKey);
  await chrome.storage.local.set({
    [STORAGE_KEY]: { encryptedApiKey, searchEngineId: trimmedEngineId } satisfies StoredGoogleSearchConfig,
  });
}

export async function getGoogleSearchEngineId(): Promise<string | null> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    throw new Error("Google web search is available from the installed Chrome extension.");
  }

  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as StoredGoogleSearchConfig | undefined;
  return stored?.searchEngineId || null;
}

async function getGoogleSearchConfig(): Promise<{ apiKey: string; searchEngineId: string }> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    throw new Error("Google web search is available from the installed Chrome extension.");
  }

  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as StoredGoogleSearchConfig | undefined;
  if (!stored?.encryptedApiKey || !stored.searchEngineId) {
    throw new Error("Add and save a Google Search API key and Search Engine ID first.");
  }

  return {
    apiKey: await decryptLocalSecret(stored.encryptedApiKey),
    searchEngineId: stored.searchEngineId,
  };
}

export async function searchGoogleWeb(query: string, maxResults = 8): Promise<GoogleWebSearchResult[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new Error("Enter a phrase to search the web.");
  }

  const { apiKey, searchEngineId } = await getGoogleSearchConfig();
  const url = new URL(API_ENDPOINT);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", searchEngineId);
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("num", String(Math.min(Math.max(Math.trunc(maxResults), 1), 10)));

  const response = await fetch(url);
  const payload = (await response.json().catch(() => ({}))) as GoogleSearchResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Google Search API returned HTTP ${response.status}.`);
  }

  return (payload.items ?? [])
    .filter(
      (item): item is { title: string; link: string; snippet: string } =>
        typeof item.title === "string" &&
        typeof item.link === "string" &&
        typeof item.snippet === "string" &&
        isHttpUrl(item.link),
    )
    .map(({ title, link, snippet }) => ({ title, link, snippet }));
}

export interface ChromeStorageAreaMock {
  get: (keys: string | string[]) => Promise<Record<string, unknown>>;
  set: (entries: Record<string, unknown>) => Promise<void>;
}

export function installChromeStorageMock(): Map<string, unknown> {
  const store = new Map<string, unknown>();

  const area: ChromeStorageAreaMock = {
    get: async (keys) => {
      const result: Record<string, unknown> = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (store.has(key)) {
          result[key] = store.get(key);
        }
      }
      return result;
    },
    set: async (entries) => {
      for (const [key, value] of Object.entries(entries)) {
        store.set(key, value);
      }
    },
  };

  (globalThis as { chrome?: unknown }).chrome = { storage: { local: area } };
  return store;
}

export function removeChromeMock(): void {
  delete (globalThis as { chrome?: unknown }).chrome;
}

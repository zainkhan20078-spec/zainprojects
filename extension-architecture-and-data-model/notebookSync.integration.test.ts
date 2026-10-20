// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db";
import { enqueueNotebookChange, flushSyncQueue } from "../syncQueue";
import { removeChromeMock } from "./helpers/chromeStorageMock";
import { resetDb } from "./helpers/resetDb";

type BackgroundListener = (
  message: unknown,
  sender: { tab?: { id?: number; windowId?: number } },
  sendResponse: (response: unknown) => void,
) => boolean | void;

function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    value: online,
    configurable: true,
  });
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}

let storage: Map<string, unknown>;
let backgroundListener: BackgroundListener | undefined;

beforeEach(async () => {
  await vi.resetModules();
  storage = new Map();
  backgroundListener = undefined;
  const localStorage = {
    get: async (key: string) => (storage.has(key) ? { [key]: storage.get(key) } : {}),
    set: async (entries: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(entries)) storage.set(key, value);
    },
    setAccessLevel: async () => undefined,
  };
  const listenerCollections = {
    alarms: {
      onAlarm: { addListener: () => undefined },
      create: () => undefined,
    },
    commands: { onCommand: { addListener: () => undefined } },
    notifications: {
      onClicked: { addListener: () => undefined },
      create: async () => undefined,
    },
    tabs: {
      get: async () => ({ windowId: 1 }),
      update: async () => undefined,
      sendMessage: async () => undefined,
      query: async () => [],
    },
    windows: { update: async () => undefined },
    sidePanel: { setPanelBehavior: async () => undefined },
  };
  const runtime = {
    lastError: undefined,
    onInstalled: { addListener: () => undefined },
    onMessage: {
      addListener: (listener: BackgroundListener) => {
        backgroundListener = listener;
      },
    },
    sendMessage: async (message: unknown) => {
      if (!backgroundListener) {
        throw new Error("Background message listener is not registered.");
      }
      return new Promise<unknown>((resolve, reject) => {
        try {
          const keepsChannelOpen = backgroundListener?.(message, {}, resolve);
          if (!keepsChannelOpen) resolve(undefined);
        } catch (error) {
          reject(error);
        }
      });
    },
    getURL: (path: string) => path,
  };
  (globalThis as { chrome?: unknown }).chrome = {
    storage: { local: localStorage },
    runtime,
    identity: {
      getAuthToken: (_options: unknown, callback: (token: string) => void) => callback("test-token"),
    },
    ...listenerCollections,
  };
  setOnline(false);
  await resetDb();
});

afterEach(async () => {
  removeChromeMock();
  vi.unstubAllGlobals();
  await resetDb();
});

describe("notebook autosync integration", () => {
  it("queues a saved notebook, creates its Google Doc, and writes the current snapshot", async () => {
    await import("../background");

    const notebookId = await db.notebooks.add({
      name: "Physics",
      featureToggles: { math: true, physics: true, lengua: true, aiChat: true },
      subjects: [],
      archivedSubjects: [],
      linkedGoogleDocId: null,
      createdAt: Date.now(),
      sortOrder: 0,
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: "folder-1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "doc-1" }))
      .mockResolvedValueOnce(jsonResponse({ body: { content: [{ endIndex: 1 }] } }))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await enqueueNotebookChange(notebookId, {
      math: "Math notes",
      physics: "F = ma",
      lengua: "",
      aiChat: "",
    });

    setOnline(true);
    await flushSyncQueue();

    const queueItems = await db.syncQueue.toArray();
    expect(queueItems).toMatchObject([{ status: "synced", attempts: 0, lastError: null }]);
    expect((await db.notebooks.get(notebookId))?.linkedGoogleDocId).toBe("doc-1");
    expect(storage.get("googleDriveFolderId")).toBe("folder-1");
    expect(storage.get("notebookDocMap")).toEqual({ [String(notebookId)]: "doc-1" });

    const batchUpdateCall = fetchMock.mock.calls[4];
    expect(String(batchUpdateCall[0])).toContain("documents/doc-1:batchUpdate");
    const batchUpdate = JSON.parse(batchUpdateCall[1].body as string) as {
      requests: Array<{ insertText?: { text?: string } }>;
    };
    expect(batchUpdate.requests[0].insertText?.text).toBe("Math\nMath notes\n\nPhysics\nF = ma\n");
  });
});

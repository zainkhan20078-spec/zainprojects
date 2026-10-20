import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, DEFAULT_FEATURE_TOGGLES } from "../db";
import { importDataFile } from "../dataBackup";
import { resetDb } from "./helpers/resetDb";

const emptyBackup = {
  metadata: {
    schemaVersion: 1,
    exportedAt: 1,
    source: "2bach-study-extension",
  },
  notebooks: [],
  notes: [],
  mathAST: [],
  docBackups: [],
  errorProfiles: [],
  exercises: [],
  aiProviders: [],
  apiKeys: [],
  aiLogs: [],
};

function backupFile(payload: unknown): File {
  return new File([JSON.stringify(payload)], "backup.json", { type: "application/json" });
}

beforeEach(async () => {
  await resetDb();
});

afterEach(async () => {
  delete (globalThis as { chrome?: unknown }).chrome;
  await resetDb();
});

describe("data backup import", () => {
  it("rejects unsupported schema versions without clearing current data", async () => {
    await db.notebooks.add({
      name: "Keep me",
      featureToggles: DEFAULT_FEATURE_TOGGLES,
      createdAt: 1,
      sortOrder: 0,
    });

    await expect(
      importDataFile(backupFile({ ...emptyBackup, metadata: { ...emptyBackup.metadata, schemaVersion: 2 } })),
    ).rejects.toThrow("unsupported schema version");

    expect(await db.notebooks.count()).toBe(1);
    expect((await db.notebooks.toArray())[0].name).toBe("Keep me");
  });

  it("rejects non-record rows before replacing current data", async () => {
    await db.notebooks.add({
      name: "Keep me",
      featureToggles: DEFAULT_FEATURE_TOGGLES,
      createdAt: 1,
      sortOrder: 0,
    });

    await expect(importDataFile(backupFile({ ...emptyBackup, notebooks: [null] }))).rejects.toThrow(
      "invalid record: notebooks",
    );

    expect(await db.notebooks.count()).toBe(1);
  });

  it("rejects imported providers with unsafe URLs before replacing current data", async () => {
    await db.notebooks.add({
      name: "Keep me",
      featureToggles: DEFAULT_FEATURE_TOGGLES,
      createdAt: 1,
      sortOrder: 0,
    });

    const payload = {
      ...emptyBackup,
      aiProviders: [{ id: 4, name: "Unsafe", baseUrl: "javascript:alert(1)", models: ["model"] }],
    };
    await expect(importDataFile(backupFile(payload))).rejects.toThrow("invalid or unsupported table records");
    expect(await db.notebooks.count()).toBe(1);
  });

  it("imports valid backup rows and reports counts", async () => {
    const existingNotebookId = await db.notebooks.add({
      name: "Before import",
      featureToggles: DEFAULT_FEATURE_TOGGLES,
      createdAt: 1,
      sortOrder: 0,
    });
    await db.syncQueue.add({
      notebookId: existingNotebookId,
      payload: { math: "stale local snapshot" },
      status: "queued",
      attempts: 0,
      queuedAt: 1,
      syncedAt: null,
      lastError: null,
    });
    const sendMessage = async (message: unknown) => {
      expect(message).toEqual({ type: "CLEAR_PENDING_SYNC_QUEUE" });
      return { ok: true };
    };
    (globalThis as { chrome?: unknown }).chrome = {
      runtime: { sendMessage },
    };

    const payload = {
      ...emptyBackup,
      notebooks: [
        {
          id: 7,
          name: "Restored",
          featureToggles: DEFAULT_FEATURE_TOGGLES,
          createdAt: 1,
          sortOrder: 0,
        },
      ],
      notes: [{ id: 12, notebookId: 7, content: { math: "x = 1" }, lastEdited: 1 }],
    };

    await expect(importDataFile(backupFile(payload))).resolves.toMatchObject({
      notebooks: 1,
      notes: 1,
      apiKeys: 0,
    });
    expect((await db.notebooks.get(7))?.name).toBe("Restored");
    expect((await db.notes.get(12))?.notebookId).toBe(7);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it("does not replace local data when the background cannot clear its pending sync queue", async () => {
    const existingNotebookId = await db.notebooks.add({
      name: "Keep me",
      featureToggles: DEFAULT_FEATURE_TOGGLES,
      createdAt: 1,
      sortOrder: 0,
    });
    await db.syncQueue.add({
      notebookId: existingNotebookId,
      payload: { math: "keep this queued snapshot" },
      status: "queued",
      attempts: 0,
      queuedAt: 1,
      syncedAt: null,
      lastError: null,
    });
    (globalThis as { chrome?: unknown }).chrome = {
      runtime: {
        sendMessage: async () => ({ ok: false, error: "background unavailable" }),
      },
    };

    await expect(importDataFile(backupFile(emptyBackup))).rejects.toThrow("background unavailable");

    expect((await db.notebooks.get(existingNotebookId))?.name).toBe("Keep me");
    expect(await db.syncQueue.count()).toBe(1);
  });
});

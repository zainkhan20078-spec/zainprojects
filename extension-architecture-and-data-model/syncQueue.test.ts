// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db";
import { enqueueNotebookChange, flushSyncQueue, subscribeToSyncStatus } from "../syncQueue";
import { installChromeStorageMock, removeChromeMock } from "./helpers/chromeStorageMock";
import { resetDb } from "./helpers/resetDb";

type SendMessageMock = ReturnType<typeof vi.fn>;

function installRuntimeMock(implementation: SendMessageMock): void {
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: { sendMessage: implementation },
  };
}

function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    value: online,
    configurable: true,
  });
}

// Enqueueing while offline avoids the implicit auto-flush so each test can
// drive flushSyncQueue() itself deterministically.
async function enqueueWhileOffline(notebookId: number, payload: Record<string, string>): Promise<void> {
  setOnline(false);
  await enqueueNotebookChange(notebookId, payload);
  setOnline(true);
}

let sendMessageMock: SendMessageMock;
let notebookId: number;

beforeEach(async () => {
  installChromeStorageMock();
  sendMessageMock = vi.fn();
  installRuntimeMock(sendMessageMock);
  setOnline(true);
  await resetDb();

  notebookId = await db.notebooks.add({
    name: "Physics",
    featureToggles: { math: true, physics: true, lengua: true, aiChat: true },
    subjects: [],
    archivedSubjects: [],
    linkedGoogleDocId: null,
    createdAt: Date.now(),
    sortOrder: 0,
  });
});

afterEach(async () => {
  removeChromeMock();
});

describe("enqueueNotebookChange", () => {
  it("keeps items queued while offline and reports them to subscribers", async () => {
    const snapshots: number[] = [];
    const unsubscribe = subscribeToSyncStatus((snapshot) => snapshots.push(snapshot.queuedCount));

    setOnline(false);
    await enqueueNotebookChange(notebookId, { math: "notes" });
    await flushSyncQueue();

    const items = await db.syncQueue.toArray();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: "queued", attempts: 0 });
    expect(snapshots).toContain(1);

    unsubscribe();
  });
});

describe("flushSyncQueue", () => {
  it("marks items synced and links the created Google Doc to the notebook", async () => {
    sendMessageMock.mockResolvedValue({ ok: true, docId: "created-doc-1" });

    await enqueueWhileOffline(notebookId, { math: "notes" });
    await flushSyncQueue();

    const items = await db.syncQueue.toArray();
    expect(items[0]).toMatchObject({ status: "synced", lastError: null });
    expect(items[0].syncedAt).not.toBeNull();

    const notebook = await db.notebooks.get(notebookId);
    expect(notebook?.linkedGoogleDocId).toBe("created-doc-1");
  });

  it("records failures with the error message and retry count, then retries later", async () => {
    sendMessageMock.mockResolvedValue({ ok: false, error: "docs api refused" });

    await enqueueWhileOffline(notebookId, { math: "notes" });
    await flushSyncQueue();

    const items = await db.syncQueue.toArray();
    expect(items[0]).toMatchObject({ status: "failed", attempts: 1, lastError: "docs api refused" });

    sendMessageMock.mockResolvedValue({ ok: true, docId: "doc-2" });
    await flushSyncQueue();

    const retried = await db.syncQueue.toArray();
    expect(retried[0]).toMatchObject({ status: "synced", lastError: null });
  });

  it("fails items whose notebook no longer exists", async () => {
    await db.notebooks.delete(notebookId);
    sendMessageMock.mockResolvedValue({ ok: true, docId: "never-used" });

    await enqueueWhileOffline(notebookId, { math: "notes" });
    await flushSyncQueue();

    const items = await db.syncQueue.toArray();
    expect(items[0]).toMatchObject({ status: "failed" });
    expect(items[0].lastError).toContain("Notebook not found");
  });

  it("marks sync as failed when Chrome runtime messaging is unavailable", async () => {
    removeChromeMock();
    const snapshots: Array<{ state: string; lastError: string | null }> = [];
    const unsubscribe = subscribeToSyncStatus((snapshot) =>
      snapshots.push({ state: snapshot.state, lastError: snapshot.lastError }),
    );

    await enqueueWhileOffline(notebookId, { math: "notes" });
    await flushSyncQueue();

    const items = await db.syncQueue.toArray();
    expect(items[0]).toMatchObject({
      status: "failed",
      attempts: 1,
      lastError: "Chrome extension runtime is unavailable; Google Docs sync was not sent.",
      syncedAt: null,
    });
    expect(snapshots).toContainEqual({
      state: "error",
      lastError: "Chrome extension runtime is unavailable; Google Docs sync was not sent.",
    });
    unsubscribe();
  });

  it("sends the notebook payload to the background script", async () => {
    sendMessageMock.mockResolvedValue({ ok: true, docId: "doc-3" });

    await enqueueWhileOffline(notebookId, { math: "payload text" });
    await flushSyncQueue();

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "SYNC_NOTEBOOK_CHANGE",
      payload: expect.objectContaining({
        notebookId,
        notebookName: "Physics",
        content: { math: "payload text" },
      }),
    });
  });

  it("flushes items enqueued while another sync is in progress", async () => {
    let releaseFirstSync!: (response: { ok: true; docId: string }) => void;
    sendMessageMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirstSync = resolve;
          }),
      )
      .mockResolvedValue({ ok: true, docId: "doc-race" });

    await enqueueNotebookChange(notebookId, { math: "first snapshot" });
    for (let attempt = 0; attempt < 100 && sendMessageMock.mock.calls.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(sendMessageMock).toHaveBeenCalledTimes(1);

    await enqueueNotebookChange(notebookId, { math: "latest snapshot" });
    releaseFirstSync({ ok: true, docId: "doc-race" });

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const queueItems = await db.syncQueue.orderBy("id").toArray();
      if (queueItems.length === 2 && queueItems.every((item) => item.status === "synced")) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(sendMessageMock).toHaveBeenCalledTimes(2);
    expect(await db.syncQueue.orderBy("id").toArray()).toMatchObject([{ status: "synced" }, { status: "synced" }]);
    expect(sendMessageMock.mock.calls[1][0]).toMatchObject({
      payload: { content: { math: "latest snapshot" } },
    });
  });
});

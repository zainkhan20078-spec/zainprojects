import { db, type JsonValue, type SyncQueueItem } from "./db";

export type SyncIndicatorState = "synced" | "syncing" | "offline" | "error";

export interface SyncSnapshot {
  state: SyncIndicatorState;
  queuedCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
}

type Listener = (snapshot: SyncSnapshot) => void;

const listeners = new Set<Listener>();
let flushInProgress = false;
let flushRequested = false;

function resolveState(queuedCount: number, failedCount: number): SyncIndicatorState {
  if (failedCount > 0) {
    return "error";
  }

  if (!navigator.onLine) {
    return "offline";
  }

  return queuedCount > 0 ? "syncing" : "synced";
}

async function buildSnapshot(): Promise<SyncSnapshot> {
  const queuedCount = await db.syncQueue.where("status").anyOf(["queued", "failed"]).count();
  const failedItems = await db.syncQueue.where("status").equals("failed").sortBy("queuedAt");
  const lastSyncedItem = await db.syncQueue.where("status").equals("synced").last();

  return {
    state: resolveState(queuedCount, failedItems.length),
    queuedCount,
    lastSyncedAt: lastSyncedItem?.syncedAt ?? null,
    lastError: failedItems[failedItems.length - 1]?.lastError ?? null,
  };
}

async function notifyListeners(): Promise<void> {
  const snapshot = await buildSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

async function pushToGoogleDocs(change: SyncQueueItem): Promise<void> {
  if (!navigator.onLine) {
    throw new Error("Offline state detected during sync.");
  }

  if (!change.notebookId) {
    throw new Error("Missing notebook id in queue item.");
  }

  const notebook = await db.notebooks.get(change.notebookId);
  if (!notebook) {
    throw new Error("Notebook not found for queued sync item.");
  }

  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    throw new Error("Chrome extension runtime is unavailable; Google Docs sync was not sent.");
  }

  const response = await chrome.runtime.sendMessage({
    type: "SYNC_NOTEBOOK_CHANGE",
    payload: {
      notebookId: notebook.id,
      notebookName: notebook.name,
      linkedGoogleDocId: notebook.linkedGoogleDocId ?? null,
      content: change.payload,
    },
  });

  if (!response?.ok) {
    throw new Error(response?.error ?? "Background sync failed.");
  }

  if (response.docId && response.docId !== notebook.linkedGoogleDocId && notebook.id) {
    await db.notebooks.update(notebook.id, {
      linkedGoogleDocId: response.docId,
    });
  }
}

export async function enqueueNotebookChange(notebookId: number, payload: JsonValue): Promise<void> {
  await db.syncQueue.add({
    notebookId,
    payload,
    status: "queued",
    attempts: 0,
    queuedAt: Date.now(),
    syncedAt: null,
    lastError: null,
  });

  await notifyListeners();

  if (navigator.onLine) {
    void flushSyncQueue();
  }
}

export async function flushSyncQueue(): Promise<void> {
  if (flushInProgress) {
    flushRequested = true;
    await notifyListeners();
    return;
  }

  if (!navigator.onLine) {
    await notifyListeners();
    return;
  }

  flushInProgress = true;

  try {
    const pendingItems = await db.syncQueue.where("status").anyOf(["queued", "failed"]).sortBy("queuedAt");

    for (const item of pendingItems) {
      if (!navigator.onLine) {
        break;
      }

      try {
        await pushToGoogleDocs(item);
        await db.syncQueue.update(item.id!, {
          status: "synced",
          syncedAt: Date.now(),
          lastError: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown sync error";
        await db.syncQueue.update(item.id!, {
          status: "failed",
          attempts: item.attempts + 1,
          lastError: message,
        });
      }
    }
  } finally {
    flushInProgress = false;
    await notifyListeners();
    if (flushRequested && navigator.onLine) {
      flushRequested = false;
      void flushSyncQueue();
    }
  }
}

export function subscribeToSyncStatus(listener: Listener): () => void {
  listeners.add(listener);
  void notifyListeners();
  return () => listeners.delete(listener);
}

export function initializeSyncQueueWorker(): () => void {
  const onOnline = () => {
    void flushSyncQueue();
  };
  const onOffline = () => {
    void notifyListeners();
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  void flushSyncQueue();

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}

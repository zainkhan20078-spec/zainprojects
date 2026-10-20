import { searchGoogleWeb } from "./googleSearch";
import {
  appendTextChunk,
  applyHighlight,
  clearDocumentBody,
  ensureMasterFolder,
  findDocumentInFolderByName,
  ensureNotebookDocument,
  getAuthToken,
  getDocumentStructure,
  getDocumentText,
  insertTextAt,
} from "./googleDocsApi";
import { splitIntoHumanChunks, TypewriterEngine } from "./typewriterEngine";
import type { DocumentBlueprint, HighlightDirective } from "./documentBlueprint";
import { resolveNotebookDocId, syncNotebookSnapshot } from "./notebookSync";

interface SyncNotebookMessage {
  type: "SYNC_NOTEBOOK_CHANGE";
  payload: {
    notebookId: number;
    notebookName: string;
    linkedGoogleDocId?: string | null;
    content: unknown;
  };
}

interface AuthenticateMessage {
  type: "AUTH_CONNECT_GOOGLE";
}

interface ClearPendingSyncQueueMessage {
  type: "CLEAR_PENDING_SYNC_QUEUE";
}

interface GetNotebookDocTextMessage {
  type: "GET_NOTEBOOK_DOC_TEXT";
  payload: {
    notebookId: number;
    notebookName: string;
    linkedGoogleDocId?: string | null;
  };
}

interface OverwriteNotebookDocMessage {
  type: "OVERWRITE_NOTEBOOK_DOC";
  payload: {
    notebookId: number;
    notebookName: string;
    linkedGoogleDocId?: string | null;
    text: string;
  };
}

interface ExecuteDocBlueprintMessage {
  type: "EXECUTE_DOC_BLUEPRINT";
  payload: {
    blueprint: DocumentBlueprint;
    text: string;
    highlights: HighlightDirective[];
  };
}

interface ReadDocStructureMessage {
  type: "READ_DOC_STRUCTURE";
  payload: {
    targetName: string;
  };
}

interface SearchPublicWebMessage {
  type: "SEARCH_PUBLIC_WEB";
  payload: {
    query: string;
  };
}

interface CaptchaManualRequiredMessage {
  type: "CAPTCHA_MANUAL_REQUIRED";
  payload: {
    message: string;
  };
}

type BackgroundMessage =
  | SyncNotebookMessage
  | AuthenticateMessage
  | ClearPendingSyncQueueMessage
  | GetNotebookDocTextMessage
  | OverwriteNotebookDocMessage
  | ExecuteDocBlueprintMessage
  | ReadDocStructureMessage
  | SearchPublicWebMessage;

function isCaptchaManualRequiredMessage(value: unknown): value is CaptchaManualRequiredMessage {
  if (!value || typeof value !== "object" || !("type" in value) || value.type !== "CAPTCHA_MANUAL_REQUIRED") {
    return false;
  }
  if (!("payload" in value) || !value.payload || typeof value.payload !== "object" || !("message" in value.payload)) {
    return false;
  }
  return typeof value.payload.message === "string";
}

interface BackgroundQueueItem {
  notebookId: number;
  notebookName: string;
  linkedGoogleDocId?: string | null;
  content: unknown;
  queuedAt: number;
}

const STORAGE_KEYS = {
  folderId: "googleDriveFolderId",
  pendingQueue: "backgroundPendingSyncQueue",
} as const;

const SYNC_ALARM_NAME = "bachillerato-sync-flush";
const HUMAN_MIN_DELAY = 150;
const HUMAN_MAX_DELAY = 300;

const typewriterEngine = new TypewriterEngine({
  appendChunk: async (docId, chunk) => {
    await appendTextChunk(docId, chunk);
  },
});

let backgroundQueueOperation: Promise<unknown> = Promise.resolve();

function withBackgroundQueueLock<T>(operation: () => Promise<T>): Promise<T> {
  const currentOperation = backgroundQueueOperation.then(operation, operation);
  backgroundQueueOperation = currentOperation.then(
    () => undefined,
    () => undefined,
  );
  return currentOperation;
}

async function getStorageValue<T>(key: string, fallback: T): Promise<T> {
  const result = await chrome.storage.local.get(key);
  if (!(key in result)) {
    return fallback;
  }
  return result[key] as T;
}

async function setStorageValue<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

async function getOrCreateMasterFolderId(): Promise<string> {
  const existing = await getStorageValue<string | null>(STORAGE_KEYS.folderId, null);
  if (existing) {
    return existing;
  }

  const year = new Date().getFullYear();
  const folder = await ensureMasterFolder(year);
  await setStorageValue(STORAGE_KEYS.folderId, folder.folderId);
  return folder.folderId;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function resolveDocIdByTargetName(params: {
  targetName: string;
  action: DocumentBlueprint["action"];
}): Promise<string> {
  const folderId = await getOrCreateMasterFolderId();
  const existing = await findDocumentInFolderByName(folderId, params.targetName);

  if (params.action === "CREATE_NEW_DOC") {
    return ensureNotebookDocument({
      folderId,
      notebookName: params.targetName,
      existingDocId: null,
    });
  }

  if (existing) {
    return existing;
  }

  return ensureNotebookDocument({
    folderId,
    notebookName: params.targetName,
    existingDocId: null,
  });
}

async function enqueueBackgroundItem(item: BackgroundQueueItem): Promise<void> {
  const queue = await getStorageValue<BackgroundQueueItem[]>(STORAGE_KEYS.pendingQueue, []);
  queue.push(item);
  await setStorageValue(STORAGE_KEYS.pendingQueue, queue);
}

async function dequeueAllBackgroundItems(): Promise<BackgroundQueueItem[]> {
  const queue = await getStorageValue<BackgroundQueueItem[]>(STORAGE_KEYS.pendingQueue, []);
  await setStorageValue(STORAGE_KEYS.pendingQueue, []);
  return queue;
}

async function flushPendingQueue(): Promise<void> {
  await withBackgroundQueueLock(async () => {
    const queue = await dequeueAllBackgroundItems();
    if (queue.length === 0) {
      return;
    }

    const retry: BackgroundQueueItem[] = [];
    for (const item of queue) {
      try {
        await syncNotebookSnapshot(item);
      } catch (error) {
        console.error(`Unable to sync queued notebook ${item.notebookId}; it will be retried.`, error);
        retry.push(item);
      }
    }

    if (retry.length > 0) {
      const existing = await getStorageValue<BackgroundQueueItem[]>(STORAGE_KEYS.pendingQueue, []);
      await setStorageValue(STORAGE_KEYS.pendingQueue, [...retry, ...existing]);
    }
  });
}

async function clearPendingBackgroundSyncQueue(): Promise<void> {
  await withBackgroundQueueLock(async () => {
    await setStorageValue(STORAGE_KEYS.pendingQueue, []);
  });
}

async function overwriteNotebookDoc(params: {
  notebookId: number;
  notebookName: string;
  linkedGoogleDocId?: string | null;
  text: string;
}): Promise<string> {
  const docId = await resolveNotebookDocId({
    notebookId: params.notebookId,
    notebookName: params.notebookName,
    linkedGoogleDocId: params.linkedGoogleDocId,
  });

  await clearDocumentBody(docId);
  await typewriterEngine.enqueue({
    docId,
    text: params.text,
  });

  return docId;
}

type DocHeadingView = { text: string; level: string; startIndex: number; endIndex: number };

async function readDocStructure(targetName: string): Promise<{ docId: string; headings: DocHeadingView[] }> {
  const docId = await resolveDocIdByTargetName({
    targetName,
    action: "APPEND_TO_EXISTING",
  });

  const structure = await getDocumentStructure(docId);
  return {
    docId,
    headings: structure.headings,
  };
}

function findHeadingIndex(
  headings: Array<{ text: string; level: string; startIndex: number; endIndex: number }>,
  targetHeading: string | undefined,
): number | null {
  if (!targetHeading) {
    return null;
  }

  const target = targetHeading.trim().toLowerCase();
  const found = headings.find((heading) => heading.text.trim().toLowerCase().includes(target));
  return found ? found.endIndex : null;
}

async function writeTextWithOptionalHighlighting(params: {
  docId: string;
  text: string;
  style: DocumentBlueprint["style"];
  startIndex: number;
  highlights: HighlightDirective[];
}): Promise<void> {
  const chunks = splitIntoHumanChunks(params.text);
  let cursor = params.startIndex;
  let consumed = 0;

  for (const chunkText of chunks) {
    const writeText = `${chunkText}\n`;
    const range = await insertTextAt(params.docId, cursor, writeText);

    const localStart = consumed;
    const localEnd = consumed + writeText.length;

    const chunkHighlights = params.highlights.filter(
      (highlight) => highlight.start < localEnd && highlight.end > localStart,
    );

    for (const highlight of chunkHighlights) {
      const relativeStart = Math.max(highlight.start, localStart) - localStart;
      const relativeEnd = Math.min(highlight.end, localEnd) - localStart;

      await applyHighlight(params.docId, range.start + relativeStart, range.start + relativeEnd, highlight.color);
    }

    cursor = range.end;
    consumed += writeText.length;

    if (params.style === "HUMAN_SPEED") {
      await sleep(randomInt(HUMAN_MIN_DELAY, HUMAN_MAX_DELAY));
    }
  }
}

async function executeDocBlueprint(payload: ExecuteDocBlueprintMessage["payload"]): Promise<{
  docId: string;
  appliedHeading?: string;
}> {
  const docId = await resolveDocIdByTargetName({
    targetName: payload.blueprint.targetName,
    action: payload.blueprint.action,
  });

  if (payload.blueprint.action === "OVERWRITE_EXISTING") {
    await clearDocumentBody(docId);
  }

  const structure = await getDocumentStructure(docId);
  const sectionIndex = findHeadingIndex(structure.headings, payload.blueprint.sectionHeading);
  const insertionIndex = payload.blueprint.action === "OVERWRITE_EXISTING" ? 1 : (sectionIndex ?? structure.endIndex);

  await writeTextWithOptionalHighlighting({
    docId,
    text: payload.text,
    style: payload.blueprint.style,
    startIndex: insertionIndex,
    highlights: payload.highlights,
  });

  return {
    docId,
    appliedHeading: payload.blueprint.sectionHeading,
  };
}

async function getNotebookDocText(params: {
  notebookId: number;
  notebookName: string;
  linkedGoogleDocId?: string | null;
}): Promise<{ docId: string; text: string }> {
  const docId = await resolveNotebookDocId(params);
  const text = await getDocumentText(docId);
  return {
    docId,
    text,
  };
}

async function handleSyncMessage(
  message: SyncNotebookMessage,
): Promise<{ ok: true; docId: string } | { ok: false; error: string }> {
  return withBackgroundQueueLock(async () => {
    try {
      const result = await syncNotebookSnapshot(message.payload);
      return {
        ok: true as const,
        docId: result.docId,
      };
    } catch (error) {
      await enqueueBackgroundItem({
        ...message.payload,
        queuedAt: Date.now(),
      });

      const errorMessage = error instanceof Error ? error.message : "Unknown background sync error";
      return {
        ok: false as const,
        error: errorMessage,
      };
    }
  });
}

function isBackgroundMessage(value: unknown): value is BackgroundMessage {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false;
  }

  const type = (value as { type: string }).type;
  return (
    type === "SYNC_NOTEBOOK_CHANGE" ||
    type === "AUTH_CONNECT_GOOGLE" ||
    type === "CLEAR_PENDING_SYNC_QUEUE" ||
    type === "GET_NOTEBOOK_DOC_TEXT" ||
    type === "OVERWRITE_NOTEBOOK_DOC" ||
    type === "EXECUTE_DOC_BLUEPRINT" ||
    type === "READ_DOC_STRUCTURE" ||
    (type === "SEARCH_PUBLIC_WEB" &&
      "payload" in value &&
      value.payload !== null &&
      typeof value.payload === "object" &&
      "query" in value.payload &&
      typeof value.payload.query === "string")
  );
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).catch((error: unknown) => {
    console.error("Unable to restrict extension storage to trusted contexts.", error);
  });

  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
    console.error("Unable to enable opening the side panel from the extension button.", error);
  });

  chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create(SYNC_ALARM_NAME, {
      delayInMinutes: 1,
      periodInMinutes: 1,
    });
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SYNC_ALARM_NAME) {
      void flushPendingQueue().catch((error: unknown) => {
        console.error("Unable to flush pending notebook sync changes.", error);
      });
    }
  });

  chrome.commands?.onCommand.addListener((command) => {
    if (command === "screen-capture-read") {
      void chrome.runtime.sendMessage({ type: "TRIGGER_SCREEN_READ" });
    }
  });

  chrome.notifications.onClicked.addListener((notificationId) => {
    const match = /^captcha-(\d+)$/.exec(notificationId);
    if (!match) {
      return;
    }

    const tabId = Number(match[1]);
    void chrome.tabs
      .get(tabId)
      .then(async (tab) => {
        await chrome.tabs.update(tabId, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
      })
      .catch((error: unknown) => {
        console.error("Unable to focus the page for manual CAPTCHA completion.", error);
      });
  });

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (isCaptchaManualRequiredMessage(message)) {
      const tabId = _sender.tab?.id;
      const windowId = _sender.tab?.windowId;
      const notificationId = `captcha-${tabId ?? Date.now()}`;

      void (async () => {
        try {
          if (tabId !== undefined) {
            await chrome.tabs.update(tabId, { active: true });
            if (windowId !== undefined) {
              await chrome.windows.update(windowId, { focused: true });
            }
          }
          await chrome.notifications.create(notificationId, {
            type: "basic",
            iconUrl: chrome.runtime.getURL("icon-128.png"),
            title: "CAPTCHA needs your attention",
            message: message.payload.message,
            priority: 2,
          });
          sendResponse({ ok: true });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unable to show CAPTCHA notification.";
          console.error(errorMessage, error);
          sendResponse({ ok: false, error: errorMessage });
        }
      })();
      return true;
    }

    if (!isBackgroundMessage(message)) {
      return;
    }

    if (message.type === "AUTH_CONNECT_GOOGLE") {
      void (async () => {
        try {
          await getAuthToken(true);
          await getOrCreateMasterFolderId();
          sendResponse({ ok: true });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Google auth failed";
          sendResponse({ ok: false, error: errorMessage });
        }
      })();

      return true;
    }

    if (message.type === "CLEAR_PENDING_SYNC_QUEUE") {
      void clearPendingBackgroundSyncQueue()
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) => {
          const errorMessage =
            error instanceof Error ? error.message : "Unable to clear pending Google Docs sync queue.";
          sendResponse({ ok: false, error: errorMessage });
        });
      return true;
    }

    if (message.type === "SEARCH_PUBLIC_WEB") {
      void (async () => {
        try {
          const results = await searchGoogleWeb(message.payload.query);
          sendResponse({ ok: true, results });
        } catch (error) {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Google web search failed.",
          });
        }
      })();
      return true;
    }

    if (message.type === "SYNC_NOTEBOOK_CHANGE") {
      void (async () => {
        const response = await handleSyncMessage(message);
        sendResponse(response);
      })();

      return true;
    }

    if (message.type === "GET_NOTEBOOK_DOC_TEXT") {
      void (async () => {
        try {
          const result = await getNotebookDocText(message.payload);
          sendResponse({ ok: true, docId: result.docId, text: result.text });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unable to read Google Doc text";
          sendResponse({ ok: false, error: errorMessage });
        }
      })();

      return true;
    }

    if (message.type === "OVERWRITE_NOTEBOOK_DOC") {
      void (async () => {
        try {
          const docId = await overwriteNotebookDoc(message.payload);
          sendResponse({ ok: true, docId });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unable to overwrite notebook Google Doc";
          sendResponse({ ok: false, error: errorMessage });
        }
      })();

      return true;
    }

    if (message.type === "READ_DOC_STRUCTURE") {
      void (async () => {
        try {
          const structure = await readDocStructure(message.payload.targetName);
          sendResponse({ ok: true, docId: structure.docId, headings: structure.headings });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unable to read document structure";
          sendResponse({ ok: false, error: errorMessage });
        }
      })();

      return true;
    }

    if (message.type === "EXECUTE_DOC_BLUEPRINT") {
      void (async () => {
        try {
          const result = await executeDocBlueprint(message.payload);
          sendResponse({ ok: true, docId: result.docId, appliedHeading: result.appliedHeading });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unable to execute document blueprint";
          sendResponse({ ok: false, error: errorMessage });
        }
      })();

      return true;
    }
  });
}

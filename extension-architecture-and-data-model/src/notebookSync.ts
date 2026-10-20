import { translateNotebookPayloadToDocText } from "./astToDocs";
import {
  ensureMasterFolder,
  ensureNotebookDocument,
  replaceDocumentBody,
} from "./googleDocsApi";
import { createNotebookSnapshotWriter } from "./notebookSnapshot";

export interface NotebookSyncPayload {
  notebookId: number;
  notebookName: string;
  linkedGoogleDocId?: string | null;
  content: unknown;
}

interface NotebookDocMap {
  [notebookId: string]: string;
}

const FOLDER_ID_STORAGE_KEY = "googleDriveFolderId";
const NOTEBOOK_DOC_MAP_STORAGE_KEY = "notebookDocMap";

const writeNotebookSnapshot = createNotebookSnapshotWriter({
  replaceDocument: replaceDocumentBody,
});

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
  const existing = await getStorageValue<string | null>(FOLDER_ID_STORAGE_KEY, null);
  if (existing) {
    return existing;
  }

  const folder = await ensureMasterFolder(new Date().getFullYear());
  await setStorageValue(FOLDER_ID_STORAGE_KEY, folder.folderId);
  return folder.folderId;
}

export async function resolveNotebookDocId(params: Omit<NotebookSyncPayload, "content">): Promise<string> {
  const map = await getStorageValue<NotebookDocMap>(NOTEBOOK_DOC_MAP_STORAGE_KEY, {});
  const mapHit = map[String(params.notebookId)];
  const folderId = await getOrCreateMasterFolderId();
  const docId = await ensureNotebookDocument({
    folderId,
    notebookName: params.notebookName,
    existingDocId: params.linkedGoogleDocId ?? mapHit ?? null,
  });

  if (mapHit !== docId) {
    map[String(params.notebookId)] = docId;
    await setStorageValue(NOTEBOOK_DOC_MAP_STORAGE_KEY, map);
  }

  return docId;
}

export async function syncNotebookSnapshot(item: NotebookSyncPayload): Promise<{
  docId: string;
  usedEquationFallback: boolean;
}> {
  const docId = await resolveNotebookDocId(item);
  const translation = translateNotebookPayloadToDocText(item.content);
  await writeNotebookSnapshot(docId, translation.textToAppend);

  return {
    docId,
    usedEquationFallback: translation.usedEquationFallback,
  };
}

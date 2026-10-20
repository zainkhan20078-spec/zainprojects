import { translateNotebookPayloadToDocText } from "./astToDocs";
import { db, type Notebook } from "./db";
import { applyMistakeProfile } from "./mistakeEngine";

export interface NotebookTextSnapshot {
  math: string;
  physics: string;
  lengua: string;
  aiChat: string;
}

interface BackgroundResponse {
  ok: boolean;
  error?: string;
  docId?: string;
  text?: string;
}

function ensureRuntime(): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    throw new Error("Chrome runtime messaging is unavailable.");
  }
}

async function sendMessage<TResponse>(message: Record<string, unknown>): Promise<TResponse> {
  ensureRuntime();
  const response = (await chrome.runtime.sendMessage(message)) as TResponse;
  return response;
}

function toPayload(content: NotebookTextSnapshot): Record<string, string> {
  return {
    math: content.math,
    physics: content.physics,
    lengua: content.lengua,
    aiChat: content.aiChat,
  };
}

function resolveSourceText(content: NotebookTextSnapshot): string {
  const translated = translateNotebookPayloadToDocText(toPayload(content));
  return translated.textToAppend;
}

async function fetchCurrentGoogleDocText(notebook: Notebook): Promise<{ docId: string; text: string }> {
  const response = await sendMessage<BackgroundResponse>({
    type: "GET_NOTEBOOK_DOC_TEXT",
    payload: {
      notebookId: notebook.id,
      notebookName: notebook.name,
      linkedGoogleDocId: notebook.linkedGoogleDocId ?? null,
    },
  });

  if (!response.ok || !response.docId) {
    throw new Error(response.error ?? "Unable to fetch notebook Google Doc.");
  }

  return {
    docId: response.docId,
    text: response.text ?? "",
  };
}

async function overwriteGoogleDoc(notebook: Notebook, docId: string, text: string): Promise<void> {
  const response = await sendMessage<BackgroundResponse>({
    type: "OVERWRITE_NOTEBOOK_DOC",
    payload: {
      notebookId: notebook.id,
      notebookName: notebook.name,
      linkedGoogleDocId: docId,
      text,
    },
  });

  if (!response.ok) {
    throw new Error(response.error ?? "Unable to overwrite notebook Google Doc.");
  }

  if (response.docId && notebook.id) {
    await db.notebooks.update(notebook.id, {
      linkedGoogleDocId: response.docId,
    });
  }
}

export async function injectProfileIntoNotebook(options: {
  notebook: Notebook;
  content: NotebookTextSnapshot;
  profileId: number;
  intensity?: number;
}): Promise<void> {
  if (!options.notebook.id) {
    throw new Error("Notebook id is required for injection.");
  }

  const cleanCandidateText = resolveSourceText(options.content);
  const remoteDoc = await fetchCurrentGoogleDocText(options.notebook);
  const cleanText = remoteDoc.text.trim() ? remoteDoc.text : cleanCandidateText;

  await db.docBackups.add({
    notebookId: options.notebook.id,
    cleanTextSnapshot: cleanText,
    timestamp: Date.now(),
  });

  const typoText = await applyMistakeProfile({
    profileId: options.profileId,
    text: cleanText,
    intensity: options.intensity,
  });

  await overwriteGoogleDoc(options.notebook, remoteDoc.docId, typoText);
}

export async function restoreNotebookFromLatestBackup(notebook: Notebook): Promise<void> {
  if (!notebook.id) {
    throw new Error("Notebook id is required for restore.");
  }

  const latest = await db.docBackups.where("notebookId").equals(notebook.id).last();
  if (!latest) {
    throw new Error("No clean backup found for this notebook.");
  }

  const remoteDoc = await fetchCurrentGoogleDocText(notebook);
  await overwriteGoogleDoc(notebook, remoteDoc.docId, latest.cleanTextSnapshot);
}

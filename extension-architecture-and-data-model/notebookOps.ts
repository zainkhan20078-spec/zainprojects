import {
  DEFAULT_FEATURE_TOGGLES,
  DEFAULT_NOTEBOOK_SUBJECTS,
  getNotebookSubjects,
  type JsonValue,
  type Notebook,
} from "../db";

export type WorkspaceMode = "editor" | "search" | "analytics" | "help";

export interface NotebookModuleContent {
  math: string;
  physics: string;
  lengua: string;
  aiChat: string;
  [subjectId: string]: string;
}

export const EMPTY_MODULE_CONTENT: NotebookModuleContent = {
  math: "",
  physics: "",
  lengua: "",
  aiChat: "",
};

export function normalizeNotebookContent(value: JsonValue | undefined): NotebookModuleContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_MODULE_CONTENT };
  }

  return {
    ...Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    ),
    math: typeof value.math === "string" ? value.math : "",
    physics: typeof value.physics === "string" ? value.physics : "",
    lengua: typeof value.lengua === "string" ? value.lengua : "",
    aiChat: typeof value.aiChat === "string" ? value.aiChat : "",
  };
}

export function createNotebookPayload(name: string, sortOrder: number): Notebook {
  return {
    name,
    featureToggles: { ...DEFAULT_FEATURE_TOGGLES },
    subjects: DEFAULT_NOTEBOOK_SUBJECTS.map((subject) => ({ ...subject })),
    archivedSubjects: [],
    linkedGoogleDocId: null,
    createdAt: Date.now(),
    sortOrder,
  };
}

export function firstEnabledModule(notebook: Notebook): string | null {
  return getNotebookSubjects(notebook)[0]?.id ?? null;
}

export function toSerializableContent(content: NotebookModuleContent): Record<string, JsonValue> {
  const serializableContent: Record<string, JsonValue> = {};
  for (const [subjectId, text] of Object.entries(content)) {
    serializableContent[subjectId] = text;
  }
  return serializableContent;
}

export function removeSubjectFromContent(content: NotebookModuleContent, subjectId: string): NotebookModuleContent {
  const next = { ...content };
  delete next[subjectId];
  return next;
}

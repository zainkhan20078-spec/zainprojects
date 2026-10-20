import Dexie, { type Table } from "dexie";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface FeatureToggles {
  math: boolean;
  physics: boolean;
  lengua: boolean;
  aiChat: boolean;
}

export const DEFAULT_FEATURE_TOGGLES: FeatureToggles = {
  math: true,
  physics: true,
  lengua: true,
  aiChat: true,
};

export interface Notebook {
  id?: number;
  name: string;
  featureToggles: FeatureToggles;
  subjects?: NotebookSubject[];
  archivedSubjects?: NotebookSubject[];
  linkedGoogleDocId?: string | null;
  createdAt: number;
  sortOrder: number;
}

export type NotebookSubjectKind = "math" | "physics" | "lengua" | "aiChat" | "custom";

export interface NotebookSubject {
  id: string;
  name: string;
  kind: NotebookSubjectKind;
}

export const DEFAULT_NOTEBOOK_SUBJECTS: NotebookSubject[] = [
  { id: "math", name: "Math", kind: "math" },
  { id: "physics", name: "Physics", kind: "physics" },
  { id: "lengua", name: "Lengua", kind: "lengua" },
  { id: "aiChat", name: "AI Assistant", kind: "aiChat" },
];

export function getNotebookSubjects(notebook: Notebook): NotebookSubject[] {
  if (Array.isArray(notebook.subjects)) {
    return notebook.subjects;
  }

  return DEFAULT_NOTEBOOK_SUBJECTS.filter((subject) => notebook.featureToggles[subject.id as keyof FeatureToggles]);
}

export interface Note {
  id?: number;
  notebookId: number;
  content: JsonValue;
  lastEdited: number;
}

export interface MathASTEntry {
  id?: number;
  rawJSON: JsonValue;
  htmlSnapshot: string;
}

export interface DocBackup {
  id?: number;
  notebookId: number;
  cleanTextSnapshot: string;
  timestamp: number;
}

export interface ErrorPattern {
  original: string;
  corrupted: string;
  type: string;
}

export interface ErrorProfile {
  id?: number;
  name: string;
  patterns: ErrorPattern[];
}

export interface Exercise {
  id?: number;
  profileId: number;
  sourceText: string;
  answerKey: JsonValue;
  createdAt: number;
}

export interface AIProvider {
  id?: number;
  name: string;
  baseUrl: string;
  models: string[];
  protocol?: "gemini" | "openai-compatible";
}

export interface ApiKey {
  id?: number;
  providerId: number;
  key: string;
  rateLimit: number;
  lastUsed: number | null;
  cooldownUntil: number | null;
}

export interface AILog {
  id?: number;
  prompt: string;
  routeTaken: string;
  tokensUsed: number;
  timestamp: number;
}

export type SyncQueueStatus = "queued" | "synced" | "failed";

export interface SyncQueueItem {
  id?: number;
  notebookId: number;
  payload: JsonValue;
  status: SyncQueueStatus;
  attempts: number;
  queuedAt: number;
  syncedAt: number | null;
  lastError: string | null;
}

export class StudyExtensionDB extends Dexie {
  notebooks!: Table<Notebook, number>;
  notes!: Table<Note, number>;
  mathAST!: Table<MathASTEntry, number>;
  docBackups!: Table<DocBackup, number>;
  errorProfiles!: Table<ErrorProfile, number>;
  exercises!: Table<Exercise, number>;
  aiProviders!: Table<AIProvider, number>;
  apiKeys!: Table<ApiKey, number>;
  aiLogs!: Table<AILog, number>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super("studyExtensionDB");

    this.version(1).stores({
      notebooks: "++id, name, linkedGoogleDocId, createdAt",
      notes: "++id, notebookId, lastEdited",
      mathAST: "++id",
      docBackups: "++id, notebookId, timestamp",
      errorProfiles: "++id, name",
      exercises: "++id, profileId, createdAt",
      aiProviders: "++id, name",
      apiKeys: "++id, providerId, lastUsed, cooldownUntil",
      aiLogs: "++id, timestamp",
    });

    this.version(2)
      .stores({
        notebooks: "++id, name, linkedGoogleDocId, createdAt, sortOrder",
        notes: "++id, notebookId, lastEdited",
        mathAST: "++id",
        docBackups: "++id, notebookId, timestamp",
        errorProfiles: "++id, name",
        exercises: "++id, profileId, createdAt",
        aiProviders: "++id, name",
        apiKeys: "++id, providerId, lastUsed, cooldownUntil",
        aiLogs: "++id, timestamp",
        syncQueue: "++id, notebookId, status, queuedAt",
      })
      .upgrade(async (transaction) => {
        const notebooksTable = transaction.table("notebooks");
        const existingNotebooks = await notebooksTable.toArray();

        await Promise.all(
          existingNotebooks.map((notebook: Notebook, index: number) => {
            const toggles = notebook.featureToggles ?? {
              math: true,
              physics: true,
              lengua: true,
            };

            return notebooksTable.put({
              ...notebook,
              sortOrder: typeof notebook.sortOrder === "number" ? notebook.sortOrder : index,
              featureToggles: {
                math: toggles.math ?? DEFAULT_FEATURE_TOGGLES.math,
                physics: toggles.physics ?? DEFAULT_FEATURE_TOGGLES.physics,
                lengua: toggles.lengua ?? DEFAULT_FEATURE_TOGGLES.lengua,
                aiChat: "aiChat" in toggles ? Boolean((toggles as FeatureToggles).aiChat) : true,
              },
              linkedGoogleDocId: notebook.linkedGoogleDocId ?? null,
            });
          }),
        );
      });

    this.version(3)
      .stores({
        notebooks: "++id, name, linkedGoogleDocId, createdAt, sortOrder",
        notes: "++id, notebookId, lastEdited",
        mathAST: "++id",
        docBackups: "++id, notebookId, timestamp",
        errorProfiles: "++id, name",
        exercises: "++id, profileId, createdAt",
        aiProviders: "++id, name",
        apiKeys: "++id, providerId, lastUsed, cooldownUntil",
        aiLogs: "++id, timestamp",
        syncQueue: "++id, notebookId, status, queuedAt",
      })
      .upgrade(async (transaction) => {
        const notebooksTable = transaction.table("notebooks");
        const existingNotebooks = await notebooksTable.toArray();
        await Promise.all(
          existingNotebooks.map((notebook: Notebook) => {
            if (Array.isArray(notebook.subjects)) {
              return Promise.resolve();
            }
            const labels: Array<[keyof FeatureToggles, string, NotebookSubjectKind]> = [
              ["math", "Math", "math"],
              ["physics", "Physics", "physics"],
              ["lengua", "Lengua", "lengua"],
              ["aiChat", "AI Assistant", "aiChat"],
            ];
            return notebooksTable.put({
              ...notebook,
              subjects: labels
                .filter(([key]) => notebook.featureToggles?.[key] !== false)
                .map(([id, name, kind]) => ({ id, name, kind })),
              archivedSubjects: [],
            });
          }),
        );
      });
  }
}

export const db = new StudyExtensionDB();

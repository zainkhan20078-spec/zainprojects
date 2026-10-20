import {
  db,
  type AILog,
  type AIProvider,
  type ApiKey,
  type DocBackup,
  type ErrorProfile,
  type Exercise,
  type MathASTEntry,
  type Notebook,
  type Note,
} from "./db";

const BACKUP_SCHEMA_VERSION = 1;
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const MAX_BACKUP_ROWS = 100_000;

export interface DataBackupFile {
  metadata: {
    schemaVersion: number;
    exportedAt: number;
    source: string;
  };
  notebooks: Notebook[];
  notes: Note[];
  mathAST: MathASTEntry[];
  docBackups: DocBackup[];
  errorProfiles: ErrorProfile[];
  exercises: Exercise[];
  aiProviders: AIProvider[];
  apiKeys: ApiKey[];
  aiLogs: AILog[];
}

export interface ImportCounts {
  notebooks: number;
  notes: number;
  mathAST: number;
  docBackups: number;
  errorProfiles: number;
  exercises: number;
  aiProviders: number;
  apiKeys: number;
  aiLogs: number;
}

function timestampForFileName(): string {
  return new Date().toISOString().replace(/:/g, "-");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidFeatureToggles(value: unknown): boolean {
  return (
    isRecord(value) &&
    ["math", "physics", "lengua", "aiChat"].every((key) => typeof value[key] === "boolean") &&
    Object.values(value).every((enabled) => typeof enabled === "boolean")
  );
}

function isValidProviderUrl(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function assertBackupShape(value: unknown): asserts value is DataBackupFile {
  if (!isRecord(value)) {
    throw new Error("Backup file content is not a valid object.");
  }

  const backup = value as Partial<DataBackupFile>;
  const listFields: Array<keyof Omit<DataBackupFile, "metadata">> = [
    "notebooks",
    "notes",
    "mathAST",
    "docBackups",
    "errorProfiles",
    "exercises",
    "aiProviders",
    "apiKeys",
    "aiLogs",
  ];

  if (
    !isRecord(backup.metadata) ||
    backup.metadata.schemaVersion !== BACKUP_SCHEMA_VERSION ||
    !Number.isFinite(backup.metadata.exportedAt) ||
    backup.metadata.source !== "2bach-study-extension"
  ) {
    throw new Error("Backup metadata is invalid or uses an unsupported schema version.");
  }

  let totalRows = 0;
  for (const field of listFields) {
    if (!Array.isArray(backup[field])) {
      throw new Error(`Backup file is missing table data: ${field}`);
    }
    totalRows += backup[field].length;
    if (backup[field].some((row) => !isRecord(row))) {
      throw new Error(`Backup table contains an invalid record: ${field}`);
    }
  }

  if (totalRows > MAX_BACKUP_ROWS) {
    throw new Error(`Backup contains too many records (maximum ${MAX_BACKUP_ROWS}).`);
  }

  const validRows = (field: (typeof listFields)[number], isValid: (row: Record<string, unknown>) => boolean) =>
    (backup[field] as unknown[]).every((row) => isRecord(row) && isValid(row));
  const hasValidId = (row: Record<string, unknown>) =>
    isFiniteNumber(row.id) && Number.isSafeInteger(row.id) && row.id > 0;
  const validSubjects = (value: unknown) =>
    value === undefined ||
    (Array.isArray(value) &&
      value.every(
        (subject) =>
          isRecord(subject) &&
          typeof subject.id === "string" &&
          typeof subject.name === "string" &&
          ["math", "physics", "lengua", "aiChat", "custom"].includes(String(subject.kind)),
      ));
  const notebooks = backup.notebooks!;
  const notes = backup.notes!;
  const docBackups = backup.docBackups!;
  const errorProfiles = backup.errorProfiles!;
  const exercises = backup.exercises!;
  const aiProviders = backup.aiProviders!;
  const apiKeys = backup.apiKeys!;

  if (
    !validRows(
      "notebooks",
      (row) =>
        hasValidId(row) &&
        typeof row.name === "string" &&
        row.name.trim().length > 0 &&
        isValidFeatureToggles(row.featureToggles) &&
        isFiniteNumber(row.createdAt) &&
        isFiniteNumber(row.sortOrder) &&
        (row.linkedGoogleDocId === undefined ||
          row.linkedGoogleDocId === null ||
          typeof row.linkedGoogleDocId === "string") &&
        validSubjects(row.subjects) &&
        validSubjects(row.archivedSubjects),
    ) ||
    !validRows(
      "notes",
      (row) => hasValidId(row) && isFiniteNumber(row.notebookId) && isFiniteNumber(row.lastEdited) && "content" in row,
    ) ||
    !validRows("mathAST", (row) => hasValidId(row) && "rawJSON" in row && typeof row.htmlSnapshot === "string") ||
    !validRows(
      "docBackups",
      (row) =>
        hasValidId(row) &&
        isFiniteNumber(row.notebookId) &&
        typeof row.cleanTextSnapshot === "string" &&
        isFiniteNumber(row.timestamp),
    ) ||
    !validRows(
      "errorProfiles",
      (row) =>
        hasValidId(row) &&
        typeof row.name === "string" &&
        Array.isArray(row.patterns) &&
        row.patterns.every(
          (pattern) =>
            isRecord(pattern) &&
            typeof pattern.original === "string" &&
            typeof pattern.corrupted === "string" &&
            typeof pattern.type === "string",
        ),
    ) ||
    !validRows(
      "exercises",
      (row) =>
        hasValidId(row) &&
        isFiniteNumber(row.profileId) &&
        typeof row.sourceText === "string" &&
        "answerKey" in row &&
        isFiniteNumber(row.createdAt),
    ) ||
    !validRows(
      "aiProviders",
      (row) =>
        hasValidId(row) &&
        typeof row.name === "string" &&
        row.name.trim().length > 0 &&
        isValidProviderUrl(row.baseUrl) &&
        (row.protocol === undefined || row.protocol === "gemini" || row.protocol === "openai-compatible") &&
        Array.isArray(row.models) &&
        row.models.every((model) => typeof model === "string" && model.trim().length > 0),
    ) ||
    !validRows(
      "apiKeys",
      (row) =>
        hasValidId(row) &&
        isFiniteNumber(row.providerId) &&
        typeof row.key === "string" &&
        isFiniteNumber(row.rateLimit) &&
        (row.lastUsed === null || isFiniteNumber(row.lastUsed)) &&
        (row.cooldownUntil === null || isFiniteNumber(row.cooldownUntil)),
    ) ||
    !validRows(
      "aiLogs",
      (row) =>
        hasValidId(row) &&
        typeof row.prompt === "string" &&
        typeof row.routeTaken === "string" &&
        isFiniteNumber(row.tokensUsed) &&
        isFiniteNumber(row.timestamp),
    )
  ) {
    throw new Error("Backup contains invalid or unsupported table records.");
  }

  const notebookIds = new Set(notebooks.map((notebook) => notebook.id));
  const profileIds = new Set(errorProfiles.map((profile) => profile.id));
  const providerIds = new Set(aiProviders.map((provider) => provider.id));
  if (
    notes.some((note) => !notebookIds.has(note.notebookId)) ||
    docBackups.some((snapshot) => !notebookIds.has(snapshot.notebookId)) ||
    exercises.some((exercise) => !profileIds.has(exercise.profileId)) ||
    apiKeys.some((apiKey) => !providerIds.has(apiKey.providerId))
  ) {
    throw new Error("Backup contains records with missing related data.");
  }
}

export async function exportAllData() {
  const payload: DataBackupFile = {
    metadata: {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: Date.now(),
      source: "2bach-study-extension",
    },
    notebooks: await db.notebooks.toArray(),
    notes: await db.notes.toArray(),
    mathAST: await db.mathAST.toArray(),
    docBackups: await db.docBackups.toArray(),
    errorProfiles: await db.errorProfiles.toArray(),
    exercises: await db.exercises.toArray(),
    aiProviders: await db.aiProviders.toArray(),
    apiKeys: await db.apiKeys.toArray(),
    aiLogs: await db.aiLogs.toArray(),
  };

  const fileName = `study-extension-backup-${timestampForFileName()}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  URL.revokeObjectURL(url);

  return { fileName, counts: toCounts(payload) };
}

function toCounts(payload: DataBackupFile): ImportCounts {
  return {
    notebooks: payload.notebooks.length,
    notes: payload.notes.length,
    mathAST: payload.mathAST.length,
    docBackups: payload.docBackups.length,
    errorProfiles: payload.errorProfiles.length,
    exercises: payload.exercises.length,
    aiProviders: payload.aiProviders.length,
    apiKeys: payload.apiKeys.length,
    aiLogs: payload.aiLogs.length,
  };
}

export async function importDataFile(file: File): Promise<ImportCounts> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new Error(`Backup file is too large (maximum ${MAX_BACKUP_BYTES / (1024 * 1024)} MB).`);
  }

  const fileContent = await file.text();
  const parsed: unknown = JSON.parse(fileContent);
  assertBackupShape(parsed);

  await clearPendingBackgroundSyncQueue();

  await db.transaction(
    "rw",
    [
      db.notebooks,
      db.notes,
      db.mathAST,
      db.docBackups,
      db.errorProfiles,
      db.exercises,
      db.aiProviders,
      db.apiKeys,
      db.aiLogs,
      db.syncQueue,
    ],
    async () => {
      await db.notebooks.clear();
      await db.notes.clear();
      await db.mathAST.clear();
      await db.docBackups.clear();
      await db.errorProfiles.clear();
      await db.exercises.clear();
      await db.aiProviders.clear();
      await db.apiKeys.clear();
      await db.aiLogs.clear();
      await db.syncQueue.clear();

      if (parsed.notebooks.length > 0) await db.notebooks.bulkAdd(parsed.notebooks);
      if (parsed.notes.length > 0) await db.notes.bulkAdd(parsed.notes);
      if (parsed.mathAST.length > 0) await db.mathAST.bulkAdd(parsed.mathAST);
      if (parsed.docBackups.length > 0) await db.docBackups.bulkAdd(parsed.docBackups);
      if (parsed.errorProfiles.length > 0) await db.errorProfiles.bulkAdd(parsed.errorProfiles);
      if (parsed.exercises.length > 0) await db.exercises.bulkAdd(parsed.exercises);
      if (parsed.aiProviders.length > 0) await db.aiProviders.bulkAdd(parsed.aiProviders);
      if (parsed.apiKeys.length > 0) await db.apiKeys.bulkAdd(parsed.apiKeys);
      if (parsed.aiLogs.length > 0) await db.aiLogs.bulkAdd(parsed.aiLogs);
    },
  );

  return toCounts(parsed);
}

async function clearPendingBackgroundSyncQueue(): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return;
  }

  const response = (await chrome.runtime.sendMessage({
    type: "CLEAR_PENDING_SYNC_QUEUE",
  })) as { ok?: boolean; error?: string } | undefined;

  if (!response?.ok) {
    throw new Error(response?.error ?? "Unable to clear pending Google Docs sync before importing backup.");
  }
}

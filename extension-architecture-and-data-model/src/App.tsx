import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HelpTab } from "./components/HelpTab";
import { AISearchWorkspace, type AISearchSource } from "./components/AISearchWorkspace";
import { NotebookView } from "./components/NotebookView";
import { NotebookSidebar } from "./components/NotebookSidebar";
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import { TabSettings } from "./components/TabSettings";
import { exportAllData, importDataFile } from "./dataBackup";
import { convertMathAstToPlainText } from "./astToDocs";
import {
  db,
  DEFAULT_NOTEBOOK_SUBJECTS,
  getNotebookSubjects,
  type AIProvider,
  type FeatureToggles,
  type Notebook,
  type NotebookSubject,
} from "./db";
import { findMatchingGlobalHotkey } from "./hotkeyRegistry";
import { captureAndReadScreen } from "./screenReader";
import { listProviders } from "./keyPool";
import {
  enqueueNotebookChange,
  initializeSyncQueueWorker,
  subscribeToSyncStatus,
  type SyncSnapshot,
} from "./syncQueue";
import {
  EMPTY_MODULE_CONTENT,
  createNotebookPayload,
  firstEnabledModule,
  normalizeNotebookContent,
  removeSubjectFromContent,
  toSerializableContent,
  type NotebookModuleContent,
  type WorkspaceMode,
} from "./lib/notebookOps";

const INITIAL_SYNC_SNAPSHOT: SyncSnapshot = {
  state: "offline",
  queuedCount: 0,
  lastSyncedAt: null,
  lastError: null,
};

export default function App() {
  const importInputRef = useRef<HTMLInputElement>(null);
  const noteSaveTimersRef = useRef<Record<number, number>>({});
  const notebookContentRef = useRef<Record<number, NotebookModuleContent>>({});

  const [statusMessage, setStatusMessage] = useState("Ready.");
  const [isBusy, setIsBusy] = useState(false);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [activeNotebookId, setActiveNotebookId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<WorkspaceMode>("editor");
  const [activeModule, setActiveModule] = useState<string | null>("math");
  const [expandedNotebookIds, setExpandedNotebookIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const [settingsNotebookId, setSettingsNotebookId] = useState<number | null>(null);
  const [notebookContent, setNotebookContent] = useState<Record<number, NotebookModuleContent>>({});
  const [syncSnapshot, setSyncSnapshot] = useState<SyncSnapshot>(INITIAL_SYNC_SNAPSHOT);

  const activeNotebook = useMemo(
    () => notebooks.find((notebook) => notebook.id === activeNotebookId) ?? null,
    [notebooks, activeNotebookId],
  );

  const settingsNotebook = useMemo(
    () => notebooks.find((notebook) => notebook.id === settingsNotebookId) ?? null,
    [notebooks, settingsNotebookId],
  );

  const refreshData = useCallback(async () => {
    const updatedNotebooks = await db.transaction("rw", db.notebooks, async () => {
      const notebookRows = await db.notebooks.orderBy("sortOrder").toArray();
      if (notebookRows.length > 0) {
        return notebookRows;
      }

      const first = createNotebookPayload("General", 0);
      const firstId = await db.notebooks.add(first);
      return [{ ...first, id: firstId }];
    });
    const noteRows = await db.notes.toArray();
    const contentMap: Record<number, NotebookModuleContent> = {};

    for (const note of noteRows) {
      contentMap[note.notebookId] = normalizeNotebookContent(note.content);
    }

    for (const notebook of updatedNotebooks) {
      if (notebook.id && !contentMap[notebook.id]) {
        contentMap[notebook.id] = { ...EMPTY_MODULE_CONTENT };
      }
    }

    setNotebooks(updatedNotebooks);
    setNotebookContent(contentMap);
    setExpandedNotebookIds((current) =>
      current.length || !updatedNotebooks[0]?.id ? current : [updatedNotebooks[0].id],
    );

    setActiveNotebookId((current) => {
      const currentExists = updatedNotebooks.some((notebook) => notebook.id === current);
      if (currentExists) {
        return current;
      }

      return updatedNotebooks[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    notebookContentRef.current = notebookContent;
  }, [notebookContent]);

  useEffect(() => {
    const startup = async () => {
      try {
        await refreshData();
      } catch (error) {
        console.error("Unable to load local notebook data.", error);
        const message = error instanceof Error ? error.message : "Unknown database error";
        setStatusMessage(`Local data failed to load: ${message}`);
      }
    };

    void startup();

    const teardownWorker = initializeSyncQueueWorker();
    const unsubscribeSync = subscribeToSyncStatus(setSyncSnapshot);

    return () => {
      teardownWorker();
      unsubscribeSync();
    };
  }, [refreshData]);

  const refreshProviders = useCallback(async () => {
    try {
      const loaded = await listProviders();
      setProviders(loaded);
      setSelectedProviderId((current) => current ?? loaded[0]?.id ?? null);
    } catch (error) {
      console.error("Unable to load AI provider settings.", error);
      const message = error instanceof Error ? error.message : "Unknown provider storage error";
      setStatusMessage(`AI providers failed to load: ${message}`);
    }
  }, []);

  useEffect(() => {
    // Initial load + subscription; setState happens in async continuations.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshProviders();
    const onProvidersUpdated = () => void refreshProviders();
    window.addEventListener("ai-providers-updated", onProvidersUpdated);
    return () => window.removeEventListener("ai-providers-updated", onProvidersUpdated);
  }, [refreshProviders]);

  useEffect(() => {
    const timers = noteSaveTimersRef.current;
    return () => {
      Object.values(timers).forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

  const handleExport = useCallback(async () => {
    if (
      !window.confirm(
        "The backup contains notebook content and encrypted API-key records. Keep the file private. API keys may need to be entered again after restoring on another browser profile. Continue?",
      )
    ) {
      return;
    }

    try {
      setIsBusy(true);
      const { fileName } = await exportAllData();
      setStatusMessage(`Export complete: ${fileName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown export error";
      setStatusMessage(`Export failed: ${message}`);
    } finally {
      setIsBusy(false);
    }
  }, []);

  const handleCreateNotebook = useCallback(async () => {
    const nextOrder = notebooks.length;
    const defaultName = `Notebook ${nextOrder + 1}`;
    const newNotebook: Notebook = createNotebookPayload(defaultName, nextOrder);
    const newId = await db.notebooks.add(newNotebook);

    const notebookWithId = { ...newNotebook, id: newId };

    setNotebooks((current) => [...current, notebookWithId]);
    setNotebookContent((current) => ({
      ...current,
      [newId]: { ...EMPTY_MODULE_CONTENT },
    }));
    setActiveView("editor");
    setActiveNotebookId(newId);
    setActiveModule(firstEnabledModule(notebookWithId));
    setExpandedNotebookIds((current) => (current.includes(newId) ? current : [...current, newId]));
    setSettingsNotebookId(newId);
  }, [notebooks.length]);

  const handleDeleteNotebook = async (id: number) => {
    await db.transaction("rw", [db.notebooks, db.notes, db.syncQueue], async () => {
      await db.notebooks.delete(id);
      await db.notes.where("notebookId").equals(id).delete();
      await db.syncQueue.where("notebookId").equals(id).delete();
    });

    setNotebooks((current) => {
      const filtered = current.filter((notebook) => notebook.id !== id);
      return filtered.map((notebook, index) => ({ ...notebook, sortOrder: index }));
    });

    setNotebookContent((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });

    if (activeNotebookId === id) {
      const remaining = notebooks.filter((notebook) => notebook.id !== id);
      setActiveNotebookId(remaining[0]?.id ?? null);
    }

    if (settingsNotebookId === id) {
      setSettingsNotebookId(null);
    }
  };

  const handleMoveNotebook = async (id: number, direction: "left" | "right") => {
    const currentIndex = notebooks.findIndex((notebook) => notebook.id === id);
    if (currentIndex < 0) {
      return;
    }

    const targetIndex = direction === "left" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= notebooks.length) {
      return;
    }

    const reordered = [...notebooks];
    const [movedNotebook] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, movedNotebook);

    const persisted = reordered.map((notebook, index) => ({ ...notebook, sortOrder: index }));

    await db.transaction("rw", [db.notebooks], async () => {
      await Promise.all(
        persisted.map((notebook) => {
          if (!notebook.id) {
            return Promise.resolve();
          }

          return db.notebooks.update(notebook.id, { sortOrder: notebook.sortOrder });
        }),
      );
    });

    setNotebooks(persisted);
  };

  const handleSaveTabSettings = async (payload: { name: string; featureToggles: FeatureToggles }) => {
    if (!settingsNotebookId) {
      return;
    }

    const targetNotebook = notebooks.find((notebook) => notebook.id === settingsNotebookId);
    if (!targetNotebook) {
      return;
    }
    let subjects = getNotebookSubjects(targetNotebook);
    let archivedSubjects = [...(targetNotebook.archivedSubjects ?? [])];
    for (const [kind, enabled] of Object.entries(payload.featureToggles) as Array<[keyof FeatureToggles, boolean]>) {
      const activeSubject = subjects.find((subject) => subject.kind === kind);
      const archivedSubject = archivedSubjects.find((subject) => subject.kind === kind);
      if (!enabled && activeSubject) {
        subjects = subjects.filter((subject) => subject.id !== activeSubject.id);
        archivedSubjects.push(activeSubject);
      } else if (enabled && !activeSubject && archivedSubject) {
        archivedSubjects = archivedSubjects.filter((subject) => subject.id !== archivedSubject.id);
        subjects = [...subjects, archivedSubject];
      } else if (enabled && !activeSubject) {
        const defaultSubject = DEFAULT_NOTEBOOK_SUBJECTS.find((subject) => subject.kind === kind);
        if (defaultSubject) subjects = [...subjects, { ...defaultSubject }];
      }
    }

    await db.notebooks.update(settingsNotebookId, {
      name: payload.name,
      featureToggles: payload.featureToggles,
      subjects,
      archivedSubjects,
    });

    setNotebooks((current) =>
      current.map((notebook) =>
        notebook.id === settingsNotebookId
          ? { ...notebook, name: payload.name, featureToggles: payload.featureToggles, subjects, archivedSubjects }
          : notebook,
      ),
    );
    if (
      settingsNotebookId === activeNotebookId &&
      activeModule &&
      !subjects.some((subject) => subject.id === activeModule)
    ) {
      setActiveModule(subjects[0]?.id ?? null);
    }
  };

  const handleAddSubject = async (notebookId: number) => {
    const notebook = notebooks.find((item) => item.id === notebookId);
    if (!notebook) return;
    const name = window.prompt("Name your new subject");
    if (!name?.trim()) return;
    if (getNotebookSubjects(notebook).some((subject) => subject.name.toLowerCase() === name.trim().toLowerCase())) {
      window.alert("This notebook already has a subject with that name.");
      return;
    }
    const subject: NotebookSubject = {
      id: `custom-${crypto.randomUUID()}`,
      name: name.trim(),
      kind: "custom",
    };
    const subjects = [...getNotebookSubjects(notebook), subject];
    await db.notebooks.update(notebookId, { subjects });
    setNotebooks((current) => current.map((item) => (item.id === notebookId ? { ...item, subjects } : item)));
    setNotebookContent((current) => ({
      ...current,
      [notebookId]: { ...(current[notebookId] ?? EMPTY_MODULE_CONTENT), [subject.id]: "" },
    }));
    openNotebook(notebook, subject.id);
  };

  const handleRenameSubject = async (notebookId: number, subject: NotebookSubject) => {
    const notebook = notebooks.find((item) => item.id === notebookId);
    if (!notebook) return;
    const name = window.prompt("Rename subject", subject.name)?.trim();
    if (!name || name === subject.name) return;
    const nameTaken = [...getNotebookSubjects(notebook), ...(notebook.archivedSubjects ?? [])].some(
      (item) => item.id !== subject.id && item.name.toLowerCase() === name.toLowerCase(),
    );
    if (nameTaken) {
      window.alert("This notebook already has a subject with that name.");
      return;
    }
    const activeSubjects = getNotebookSubjects(notebook).map((item) =>
      item.id === subject.id ? { ...item, name } : item,
    );
    const archivedSubjects = (notebook.archivedSubjects ?? []).map((item) =>
      item.id === subject.id ? { ...item, name } : item,
    );
    await db.notebooks.update(notebookId, { subjects: activeSubjects, archivedSubjects });
    setNotebooks((current) =>
      current.map((item) => (item.id === notebookId ? { ...item, subjects: activeSubjects, archivedSubjects } : item)),
    );
  };

  const handleArchiveSubject = async (notebookId: number, subject: NotebookSubject) => {
    const notebook = notebooks.find((item) => item.id === notebookId);
    if (!notebook) return;
    const activeSubjects = getNotebookSubjects(notebook);
    if (!activeSubjects.some((item) => item.id === subject.id)) return;
    const subjects = activeSubjects.filter((item) => item.id !== subject.id);
    const archivedSubjects = [...(notebook.archivedSubjects ?? []), subject];
    await db.notebooks.update(notebookId, { subjects, archivedSubjects });
    setNotebooks((current) =>
      current.map((item) => (item.id === notebookId ? { ...item, subjects, archivedSubjects } : item)),
    );
    if (activeNotebookId === notebookId && activeModule === subject.id) {
      setActiveModule(subjects[0]?.id ?? null);
    }
  };

  const handleRestoreSubject = async (notebookId: number, subject: NotebookSubject) => {
    const notebook = notebooks.find((item) => item.id === notebookId);
    if (!notebook) return;
    const subjects = [...getNotebookSubjects(notebook), subject];
    const archivedSubjects = (notebook.archivedSubjects ?? []).filter((item) => item.id !== subject.id);
    await db.notebooks.update(notebookId, { subjects, archivedSubjects });
    setNotebooks((current) =>
      current.map((item) => (item.id === notebookId ? { ...item, subjects, archivedSubjects } : item)),
    );
  };

  const handleDeleteArchivedSubject = async (notebookId: number, subject: NotebookSubject) => {
    if (!window.confirm(`Permanently delete "${subject.name}" and all its notes? This cannot be undone.`)) return;
    const content = removeSubjectFromContent(
      notebookContentRef.current[notebookId] ?? { ...EMPTY_MODULE_CONTENT },
      subject.id,
    );
    const serializableContent = toSerializableContent(content);
    const pendingTimer = noteSaveTimersRef.current[notebookId];
    if (pendingTimer) {
      window.clearTimeout(pendingTimer);
      delete noteSaveTimersRef.current[notebookId];
    }
    try {
      await db.transaction("rw", [db.notebooks, db.notes], async () => {
        const notebook = await db.notebooks.get(notebookId);
        if (!notebook) return;
        const archivedSubjects = (notebook.archivedSubjects ?? []).filter((item) => item.id !== subject.id);
        await db.notebooks.update(notebookId, { archivedSubjects });
        const note = await db.notes.where("notebookId").equals(notebookId).first();
        if (note?.id) {
          await db.notes.update(note.id, { content: serializableContent, lastEdited: Date.now() });
        }
      });
    } catch (error) {
      noteSaveTimersRef.current[notebookId] = window.setTimeout(() => {
        void persistNotebookContent(notebookId).catch((error: unknown) => {
          console.error("Unable to save notebook changes.", error);
          const message = error instanceof Error ? error.message : "Unknown notebook save error";
          setStatusMessage(`Notebook save failed: ${message}`);
        });
      }, 350);
      setStatusMessage(
        `Could not permanently delete subject: ${error instanceof Error ? error.message : "Database error"}`,
      );
      return;
    }
    notebookContentRef.current = {
      ...notebookContentRef.current,
      [notebookId]: content,
    };
    const notebook = notebooks.find((item) => item.id === notebookId);
    setNotebooks((current) =>
      current.map((item) =>
        item.id === notebookId
          ? {
              ...item,
              archivedSubjects: (item.archivedSubjects ?? []).filter((subjectItem) => subjectItem.id !== subject.id),
            }
          : item,
      ),
    );
    setNotebookContent((current) => ({ ...current, [notebookId]: content }));
    try {
      await enqueueNotebookChange(notebookId, serializableContent);
      if (notebook) setStatusMessage(`Permanently deleted subject "${subject.name}".`);
    } catch (error) {
      setStatusMessage(
        `Subject deleted locally, but sync could not be queued: ${error instanceof Error ? error.message : "Sync error"}`,
      );
    }
  };

  const persistNotebookContent = useCallback(async (notebookId: number) => {
    const content = notebookContentRef.current[notebookId] ?? { ...EMPTY_MODULE_CONTENT };
    const serializableContent = toSerializableContent(content);
    const existingNote = await db.notes.where("notebookId").equals(notebookId).first();

    if (existingNote?.id) {
      await db.notes.update(existingNote.id, {
        content: serializableContent,
        lastEdited: Date.now(),
      });
    } else {
      await db.notes.add({
        notebookId,
        content: serializableContent,
        lastEdited: Date.now(),
      });
    }

    await enqueueNotebookChange(notebookId, serializableContent);
  }, []);

  const scheduleNoteSave = useCallback(
    (notebookId: number) => {
      const existingTimer = noteSaveTimersRef.current[notebookId];
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }

      noteSaveTimersRef.current[notebookId] = window.setTimeout(() => {
        void persistNotebookContent(notebookId);
      }, 350);
    },
    [persistNotebookContent],
  );

  const handleNotebookContentChange = (module: string, value: string) => {
    if (!activeNotebookId) {
      return;
    }

    setNotebookContent((current) => {
      const currentContent = current[activeNotebookId] ?? { ...EMPTY_MODULE_CONTENT };
      return {
        ...current,
        [activeNotebookId]: {
          ...currentContent,
          [module]: value,
        },
      };
    });

    scheduleNoteSave(activeNotebookId);
  };

  const appendTextToActiveNotebook = useCallback(
    (text: string, target: "aiChat" | "lengua" = "aiChat") => {
      if (!activeNotebookId || !text.trim()) {
        return;
      }

      setNotebookContent((current) => {
        const currentContent = current[activeNotebookId] ?? { ...EMPTY_MODULE_CONTENT };
        const currentValue = currentContent[target];
        const spacer = currentValue.trim().length > 0 ? "\n\n" : "";

        return {
          ...current,
          [activeNotebookId]: {
            ...currentContent,
            [target]: `${currentValue}${spacer}${text}`,
          },
        };
      });

      scheduleNoteSave(activeNotebookId);
    },
    [activeNotebookId, scheduleNoteSave],
  );

  const runScreenCaptureRead = useCallback(async () => {
    if (!activeNotebookId) {
      setStatusMessage("Select a notebook before using Screen Capture & Read.");
      return;
    }

    try {
      setStatusMessage("Reading screen with OCR...");
      const result = await captureAndReadScreen();
      appendTextToActiveNotebook(result.extractedText, "aiChat");
      setStatusMessage("Screen OCR inserted into current notebook AI Chat.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Screen read failed";
      setStatusMessage(`Screen read failed: ${message}`);
    }
  }, [activeNotebookId, appendTextToActiveNotebook]);

  useEffect(() => {
    const onScreenRead = (event: KeyboardEvent) => {
      if (!event.altKey || event.key.toLowerCase() !== "s") {
        return;
      }

      event.preventDefault();

      if (!activeNotebookId) {
        setStatusMessage("Select a notebook before using Screen Capture & Read.");
        return;
      }

      void runScreenCaptureRead();
    };

    window.addEventListener("keydown", onScreenRead);
    return () => window.removeEventListener("keydown", onScreenRead);
  }, [activeNotebookId, runScreenCaptureRead]);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
      return;
    }

    const handler = (message: unknown) => {
      if (!message || typeof message !== "object" || !("type" in message)) {
        return;
      }

      if ((message as { type: string }).type === "TRIGGER_SCREEN_READ") {
        void runScreenCaptureRead();
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    return () => {
      chrome.runtime.onMessage.removeListener(handler);
    };
  }, [runScreenCaptureRead]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const match = findMatchingGlobalHotkey(event);
      if (!match) {
        return;
      }

      event.preventDefault();

      if (match.id === "openHelp") {
        setActiveView("help");
        return;
      }

      if (match.id === "newNotebook") {
        void handleCreateNotebook();
        return;
      }

      if (match.id === "exportData") {
        void handleExport();
        return;
      }

      if (match.id === "importData") {
        importInputRef.current?.click();
        return;
      }

      if (match.id === "openTabSettings" && activeNotebookId) {
        setSettingsNotebookId(activeNotebookId);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeNotebookId, notebooks.length, handleCreateNotebook, handleExport]);

  const handleImportChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (
      !window.confirm(
        "Importing replaces all current notebooks, notes, and related data. Export a backup first if you may need the current data. Continue?",
      )
    ) {
      event.target.value = "";
      return;
    }

    try {
      setIsBusy(true);
      const counts = await importDataFile(file);
      await refreshData();
      setStatusMessage(
        `Import complete: ${counts.notebooks} notebooks, ${counts.notes} notes, ${counts.exercises} exercises.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown import error";
      setStatusMessage(`Import failed: ${message}`);
    } finally {
      setIsBusy(false);
      event.target.value = "";
    }
  };

  const openNotebook = (notebook: Notebook, module: string | null = null) => {
    setActiveNotebookId(notebook.id ?? null);
    setActiveModule(module);
    setActiveView("editor");
    if (notebook.id) {
      setExpandedNotebookIds((current) => (current.includes(notebook.id!) ? current : [...current, notebook.id!]));
    }
  };

  const handleToggleExpand = (notebookId: number) => {
    setExpandedNotebookIds((current) =>
      current.includes(notebookId) ? current.filter((id) => id !== notebookId) : [...current, notebookId],
    );
  };

  const handleSearchHandoff = (query: string) => {
    setSearchQuery(query);
    setActiveView("search");
  };

  const aiSearchSources: AISearchSource[] = notebooks.flatMap((notebook) => {
    const content = notebook.id ? notebookContent[notebook.id] : undefined;
    const subjects = [...getNotebookSubjects(notebook), ...(notebook.archivedSubjects ?? [])];
    return subjects
      .map((subject) => ({
        notebookName: notebook.name,
        subjectName: subject.name,
        text:
          subject.kind === "math" || subject.kind === "physics"
            ? convertMathAstToPlainText(content?.[subject.id] ?? "").text
            : (content?.[subject.id] ?? ""),
      }))
      .filter((source) => source.text.trim().length > 0);
  });

  const wordCount = Object.values(notebookContent).reduce(
    (total, content) =>
      total +
      (Object.values(content)
        .join(" ")
        .match(/\b[\p{L}\p{N}]+\b/gu)?.length ?? 0),
    0,
  );
  const notesWithContent = Object.values(notebookContent).filter((content) =>
    Object.values(content).some((text) => text.trim()),
  ).length;

  return (
    <main className="workspace-shell">
      <WorkspaceHeader
        providers={providers}
        selectedProviderId={selectedProviderId}
        onProviderChange={setSelectedProviderId}
        syncSnapshot={syncSnapshot}
        statusMessage={statusMessage}
        isBusy={isBusy}
        activeView={activeView}
        onNavigate={setActiveView}
        onExport={() => void handleExport()}
        onImportClick={() => importInputRef.current?.click()}
        onImportChange={(event) => void handleImportChange(event)}
        importInputRef={importInputRef}
      />

      <div className="workspace-body">
        <NotebookSidebar
          notebooks={notebooks}
          activeNotebookId={activeNotebookId}
          activeModule={activeModule}
          expandedNotebookIds={expandedNotebookIds}
          onOpenNotebook={openNotebook}
          onToggleExpand={handleToggleExpand}
          onCreateNotebook={() => void handleCreateNotebook()}
          onOpenSettings={setSettingsNotebookId}
          onMoveNotebook={(id, direction) => void handleMoveNotebook(id, direction)}
          onDeleteNotebook={(id) => void handleDeleteNotebook(id)}
          onAddSubject={(id) => void handleAddSubject(id)}
          onRenameSubject={(id, subject) => void handleRenameSubject(id, subject)}
          onArchiveSubject={(id, subject) => void handleArchiveSubject(id, subject)}
          onRestoreSubject={(id, subject) => void handleRestoreSubject(id, subject)}
          onSearch={handleSearchHandoff}
        />

        <section className="workspace-main" aria-label="Main workspace">
          <div className="canvas-toolbar">
            <div>
              <p className="eyebrow">{activeView.toUpperCase()}</p>
              <h1>
                {activeView === "search"
                  ? "Search"
                  : activeView === "analytics"
                    ? "Your study overview"
                    : activeView === "help"
                      ? "Help & instructions"
                      : (activeNotebook?.name ?? "Study notebook")}
              </h1>
            </div>
            <span className="canvas-subtitle">
              {activeView === "editor" ? "All changes save automatically on this device" : "Your workspace at a glance"}
            </span>
          </div>
          <div className="canvas-scroll">
            {settingsNotebook && (
              <div className="settings-card">
                <TabSettings
                  notebook={settingsNotebook}
                  onClose={() => setSettingsNotebookId(null)}
                  onSave={handleSaveTabSettings}
                />
              </div>
            )}
            {activeView === "help" && <HelpTab />}
            {activeView === "editor" && (
              <NotebookView
                notebook={activeNotebook}
                content={
                  activeNotebookId
                    ? (notebookContent[activeNotebookId] ?? { ...EMPTY_MODULE_CONTENT })
                    : EMPTY_MODULE_CONTENT
                }
                activeModule={activeModule}
                onChange={handleNotebookContentChange}
                onIngestText={(text) => appendTextToActiveNotebook(text, "aiChat")}
                selectedProviderId={selectedProviderId}
                onProviderChange={setSelectedProviderId}
                onAddSubject={() => activeNotebookId && void handleAddSubject(activeNotebookId)}
                onRenameSubject={(subject) => activeNotebookId && void handleRenameSubject(activeNotebookId, subject)}
                onArchiveSubject={(subject) => activeNotebookId && void handleArchiveSubject(activeNotebookId, subject)}
                onRestoreSubject={(subject) => activeNotebookId && void handleRestoreSubject(activeNotebookId, subject)}
                onDeleteArchivedSubject={(subject) =>
                  activeNotebookId && void handleDeleteArchivedSubject(activeNotebookId, subject)
                }
              />
            )}
            {activeView === "search" && (
              <AISearchWorkspace
                initialQuery={searchQuery}
                sources={aiSearchSources}
                providers={providers}
                selectedProviderId={selectedProviderId}
              />
            )}
            {activeView === "analytics" && (
              <div className="analytics-grid">
                <article className="metric-card">
                  <span>Notebooks</span>
                  <strong>{notebooks.length}</strong>
                  <p>Your subject folders</p>
                </article>
                <article className="metric-card">
                  <span>Notes with content</span>
                  <strong>{notesWithContent}</strong>
                  <p>Notebooks where you have started writing</p>
                </article>
                <article className="metric-card">
                  <span>Words written</span>
                  <strong>{wordCount.toLocaleString()}</strong>
                  <p>Across all saved subjects</p>
                </article>
                <article className="metric-card">
                  <span>Pending sync</span>
                  <strong>{syncSnapshot.queuedCount}</strong>
                  <p>
                    {syncSnapshot.state === "error"
                      ? syncSnapshot.lastError ?? "Google Docs sync failed"
                      : syncSnapshot.state === "offline"
                        ? "Saved locally; sync will resume online"
                        : "Waiting to sync with Google Docs"}
                  </p>
                </article>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

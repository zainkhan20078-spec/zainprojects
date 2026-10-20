import { useMemo, useRef } from "react";
import { getNotebookSubjects, type FeatureToggles, type Notebook, type NotebookSubject } from "../db";
import type { NotebookModuleContent } from "../lib/notebookOps";
import { ContextualMiniPopup } from "./ContextualMiniPopup";
import { AIChat } from "./AIChat";
import { DyslexiaTrainer } from "./DyslexiaTrainer";
import { FileDropZone } from "./FileDropZone";
import { ManualToolbar, type ManualAction } from "./ManualToolbar";
import { applyTextMacroOnSpace } from "./MacroEngine";
import { MathEditor, type MathEditorHandle } from "./MathEditor";

export type { NotebookModuleContent };

type InsertFeature = "math" | "physics" | "lengua" | "ai";

interface NotebookViewProps {
  notebook: Notebook | null;
  content: NotebookModuleContent;
  activeModule: string | null;
  selectedProviderId: number | null;
  onProviderChange: (providerId: number) => void;
  onChange: (module: string, value: string) => void;
  onIngestText: (text: string) => void;
  onAddSubject: () => void;
  onRenameSubject: (subject: NotebookSubject) => void;
  onArchiveSubject: (subject: NotebookSubject) => void;
  onRestoreSubject: (subject: NotebookSubject) => void;
  onDeleteArchivedSubject: (subject: NotebookSubject) => void;
}

interface ModuleConfig {
  key: keyof FeatureToggles;
  label: string;
  placeholder: string;
}

const MODULES: ModuleConfig[] = [
  { key: "math", label: "Math Editor", placeholder: "Math notes placeholder (Phase 1)." },
  { key: "physics", label: "Physics Editor", placeholder: "Physics notes placeholder (Phase 1)." },
  { key: "lengua", label: "Lengua Editor", placeholder: "Lengua notes placeholder (Phase 1)." },
  { key: "aiChat", label: "AI Chat", placeholder: "AI chat context placeholder (Phase 1)." },
];

export function NotebookView({
  notebook,
  content,
  activeModule,
  selectedProviderId,
  onProviderChange,
  onChange,
  onIngestText,
  onAddSubject,
  onRenameSubject,
  onArchiveSubject,
  onRestoreSubject,
  onDeleteArchivedSubject,
}: NotebookViewProps) {
  const mathEditorRef = useRef<MathEditorHandle>(null);
  const physicsEditorRef = useRef<MathEditorHandle>(null);
  const lenguaTextAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const lenguaToolbarActions: ManualAction[] = useMemo(
    () => [
      { id: "lengua-a", label: "á", icon: "a~" },
      { id: "lengua-e", label: "é", icon: "e~" },
      { id: "lengua-n", label: "ñ", icon: "n~" },
      { id: "lengua-preg", label: "¿", icon: "?" },
      { id: "lengua-excl", label: "¡", icon: "!" },
    ],
    [],
  );

  if (!notebook) {
    return (
      <section className="px-4 py-8 sm:px-6">
        <p className="text-lg text-slate-300">Create a notebook to start working.</p>
      </section>
    );
  }

  const enabledModules = MODULES.filter((module) =>
    getNotebookSubjects(notebook).some(
      (subject) => subject.kind === module.key && (!activeModule || subject.id === activeModule),
    ),
  );
  const customSubjects = getNotebookSubjects(notebook).filter(
    (subject) => subject.kind === "custom" && (!activeModule || subject.id === activeModule),
  );
  const currentSubject =
    getNotebookSubjects(notebook).find((subject) => subject.id === activeModule) ??
    notebook.archivedSubjects?.find((subject) => subject.id === activeModule) ??
    null;

  const insertIntoTextarea = (feature: "lengua", token: string) => {
    const targetRef = lenguaTextAreaRef.current;
    if (!targetRef) {
      return;
    }

    const currentValue = content[feature];
    const start = targetRef.selectionStart ?? currentValue.length;
    const end = targetRef.selectionEnd ?? currentValue.length;
    const nextValue = `${currentValue.slice(0, start)}${token}${currentValue.slice(end)}`;
    const nextCaret = start + token.length;

    onChange(feature, nextValue);

    window.requestAnimationFrame(() => {
      const freshTarget = lenguaTextAreaRef.current;
      if (!freshTarget) {
        return;
      }
      freshTarget.focus();
      freshTarget.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const handleContextualInsert = (token: string, feature: InsertFeature) => {
    if (feature === "math") {
      mathEditorRef.current?.insertTokenAtCursor(token);
      return;
    }

    if (feature === "physics") {
      physicsEditorRef.current?.insertTokenAtCursor(token);
      return;
    }

    if (feature === "lengua") {
      insertIntoTextarea(feature, token);
      return;
    }

    if (feature === "ai") {
      const spacer = content.aiChat.trim().length > 0 ? "\n" : "";
      onChange("aiChat", `${content.aiChat}${spacer}${token}`);
      return;
    }
  };

  const handleTextMacroKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
    mode: "lengua",
    module: "lengua",
  ) => {
    if (event.key !== " ") {
      return;
    }

    const target = event.currentTarget;
    const caretIndex = target.selectionStart ?? 0;
    const result = applyTextMacroOnSpace({
      mode,
      text: target.value,
      caretIndex,
    });

    if (!result.applied) {
      return;
    }

    event.preventDefault();
    onChange(module, result.nextText);

    window.requestAnimationFrame(() => {
      target.focus();
      target.setSelectionRange(result.nextCaret, result.nextCaret);
    });
  };

  return (
    <section className="flex flex-1 flex-col gap-5 py-5">
      <header className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-300">Your study space</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">{notebook.name}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
              onClick={onAddSubject}
            >
              + Subject
            </button>
            {currentSubject && (
              <>
                <button
                  type="button"
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
                  onClick={() => onRenameSubject(currentSubject)}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50"
                  onClick={() => onArchiveSubject(currentSubject)}
                >
                  Archive
                </button>
              </>
            )}
            <ContextualMiniPopup features={notebook.featureToggles} onInsert={handleContextualInsert} />
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          {activeModule
            ? "Your notes are saved automatically on this device."
            : "Choose a subject below and start typing. Your notes are saved automatically on this device."}
        </p>
        {!activeModule && (
          <ol className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-3">
            <li className="flex items-start gap-2">
              <span className="font-semibold text-indigo-300">1.</span>
              <span>Pick a subject editor.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold text-indigo-300">2.</span>
              <span>Type or paste your notes.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold text-indigo-300">3.</span>
              <span>Use Backup & data to keep a copy.</span>
            </li>
          </ol>
        )}
      </header>
      {enabledModules.length === 0 ? (
        customSubjects.length > 0 ? null : (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <h3 className="font-medium text-amber-100">No subjects are turned on yet</h3>
            <p className="mt-1 text-sm text-slate-300">
              Add a subject from the notebook list or restore one from the archived subjects below.
            </p>
          </div>
        )
      ) : (
        enabledModules.map((module) => {
          if (module.key === "math") {
            return (
              <div
                key={module.key}
                className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5"
              >
                <label htmlFor="math-editor" className="block text-base font-semibold text-slate-100">
                  {module.label}
                </label>
                <MathEditor
                  ref={mathEditorRef}
                  value={content.math}
                  mode="math"
                  onChange={(nextValue: string) => onChange("math", nextValue)}
                />
              </div>
            );
          }

          if (module.key === "physics") {
            return (
              <div
                key={module.key}
                className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5"
              >
                <h3 className="block text-base font-semibold text-slate-100">{module.label}</h3>
                <MathEditor
                  ref={physicsEditorRef}
                  value={content.physics}
                  mode="physics"
                  onChange={(nextValue: string) => onChange("physics", nextValue)}
                />
              </div>
            );
          }

          if (module.key === "lengua") {
            return (
              <div
                key={module.key}
                className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5"
              >
                <label htmlFor="lengua-editor" className="block text-base font-semibold text-slate-100">
                  {module.label}
                </label>
                <p className="text-sm text-slate-400">
                  Tip: type \a, \e, or \n and press Space for Spanish characters.
                </p>
                <ManualToolbar
                  title="Lengua Manual Toolbar"
                  actions={lenguaToolbarActions}
                  onAction={(action) => {
                    const map: Record<string, string> = {
                      "lengua-a": "á",
                      "lengua-e": "é",
                      "lengua-n": "ñ",
                      "lengua-preg": "¿",
                      "lengua-excl": "¡",
                    };
                    const token = map[action.id];
                    if (token) {
                      insertIntoTextarea("lengua", token);
                    }
                  }}
                />
                <textarea
                  id="lengua-editor"
                  ref={lenguaTextAreaRef}
                  value={content.lengua}
                  onChange={(event) => onChange("lengua", event.target.value)}
                  onKeyDown={(event) => handleTextMacroKeyDown(event, "lengua", "lengua")}
                  placeholder={module.placeholder}
                  className="h-40 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base leading-relaxed text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
                  lang="es-ES"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck
                />
              </div>
            );
          }

          return (
            <div key={String(module.key)}>
              <AIChat
                notebookContext={`${content.math}\n\n${content.physics}\n\n${content.lengua}`}
                currentValue={content.aiChat}
                selectedProviderId={selectedProviderId}
                onProviderChange={onProviderChange}
                onAppendToNotebook={(text) => {
                  const spacer = content.aiChat.trim().length > 0 ? "\n\n" : "";
                  onChange("aiChat", `${content.aiChat}${spacer}${text}`);
                }}
              />
            </div>
          );
        })
      )}
      {customSubjects.map((subject) => (
        <section key={subject.id} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={`subject-${subject.id}`} className="block text-base font-semibold text-slate-100">
              {subject.name}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
                onClick={() => onRenameSubject(subject)}
              >
                Rename
              </button>
              <button
                type="button"
                className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50"
                onClick={() => onArchiveSubject(subject)}
              >
                Archive
              </button>
            </div>
          </div>
          <textarea
            id={`subject-${subject.id}`}
            value={content[subject.id] ?? ""}
            onChange={(event) => onChange(subject.id, event.target.value)}
            placeholder={`Write your ${subject.name} notes here...`}
            className="h-48 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base leading-relaxed text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
          />
        </section>
      ))}

      <details className="group rounded-xl border border-slate-800 bg-slate-900/40">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm text-slate-300 hover:text-white [&::-webkit-details-marker]:hidden">
          <span>
            <span className="font-medium text-slate-100">Import study material</span>
            <span className="ml-2 hidden text-slate-500 sm:inline">Add text from documents and images</span>
          </span>
          <span className="text-xs text-slate-500 group-open:rotate-180" aria-hidden="true">
            ⌄
          </span>
        </summary>
        <div className="border-t border-slate-800 p-4">
          <FileDropZone onTextIngested={onIngestText} />
        </div>
      </details>
      {notebook.archivedSubjects && notebook.archivedSubjects.length > 0 && (
        <details className="group rounded-xl border border-slate-800 bg-slate-900/40">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm text-slate-300 hover:text-white [&::-webkit-details-marker]:hidden">
            <span>
              <span className="font-medium text-slate-100">Archived subjects</span>
              <span className="ml-2 text-slate-500">{notebook.archivedSubjects.length} · notes retained</span>
            </span>
            <span className="text-xs text-slate-500" aria-hidden="true">
              ⌄
            </span>
          </summary>
          <div className="grid gap-2 border-t border-slate-800 p-4">
            {notebook.archivedSubjects.map((subject) => (
              <div
                key={subject.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 px-3 py-2"
              >
                <span className="text-sm text-slate-200">{subject.name}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-indigo-600 hover:underline"
                    onClick={() => onRestoreSubject(subject)}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className="text-xs text-rose-700 hover:underline"
                    onClick={() => onDeleteArchivedSubject(subject)}
                  >
                    Delete permanently
                  </button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
      <details className="group rounded-xl border border-slate-800 bg-slate-900/40">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm text-slate-300 hover:text-white [&::-webkit-details-marker]:hidden">
          <span>
            <span className="font-medium text-slate-100">Dyslexia practice tools</span>
            <span className="ml-2 hidden text-slate-500 sm:inline">Optional Google Docs tools</span>
          </span>
          <span className="text-xs text-slate-500 group-open:rotate-180" aria-hidden="true">
            ⌄
          </span>
        </summary>
        <div className="border-t border-slate-800 p-4">
          <DyslexiaTrainer notebook={notebook} content={content} />
        </div>
      </details>
    </section>
  );
}

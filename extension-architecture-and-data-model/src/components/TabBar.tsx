import { useState } from "react";
import type { Notebook } from "../db";

interface TabBarProps {
  notebooks: Notebook[];
  activeNotebookId: number | null;
  isHelpActive: boolean;
  onSelectHelp: () => void;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onRename: (id: number, name: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onMove: (id: number, direction: "left" | "right") => Promise<void>;
  onOpenSettings: (id: number) => void;
}

export function TabBar({
  notebooks,
  activeNotebookId,
  isHelpActive,
  onSelectHelp,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onMove,
  onOpenSettings,
}: TabBarProps) {
  const [editingTabId, setEditingTabId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const beginRename = (notebook: Notebook) => {
    setEditingTabId(notebook.id ?? null);
    setEditingName(notebook.name);
  };

  const submitRename = async (notebook: Notebook) => {
    if (!notebook.id) {
      return;
    }

    const nextName = editingName.trim();
    if (nextName && nextName !== notebook.name) {
      await onRename(notebook.id, nextName);
    }

    setEditingTabId(null);
    setEditingName("");
  };

  return (
    <nav aria-label="Study notebooks" className="border-b border-slate-800 bg-slate-900/70 px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={onSelectHelp}
          aria-current={isHelpActive ? "page" : undefined}
          className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition ${
            isHelpActive
              ? "bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-400/40"
              : "text-slate-300 hover:bg-slate-800 hover:text-white"
          }`}
        >
          Help
        </button>

        {notebooks.map((notebook, index) => {
          const isActive = notebook.id === activeNotebookId;
          const isEditing = notebook.id === editingTabId;

          return (
            <div key={notebook.id} className="flex shrink-0 items-center gap-1">
              {isEditing ? (
                <input
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  onBlur={() => void submitRename(notebook)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void submitRename(notebook);
                    }

                    if (event.key === "Escape") {
                      setEditingTabId(null);
                    }
                  }}
                  autoFocus
                  aria-label="Notebook name"
                  className="w-36 rounded-lg border border-indigo-400 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none"
                />
              ) : (
                <button
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  className={`max-w-40 truncate rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-400/40"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                  onClick={() => notebook.id && onSelect(notebook.id)}
                >
                  {notebook.name}
                </button>
              )}

              {isActive && notebook.id && (
                <details className="relative">
                  <summary
                    aria-label={`Options for ${notebook.name}`}
                    className="list-none cursor-pointer rounded-lg px-2 py-2 text-slate-400 hover:bg-slate-800 hover:text-white [&::-webkit-details-marker]:hidden"
                  >
                    <span aria-hidden="true">•••</span>
                  </summary>
                  <div className="absolute right-0 z-30 mt-2 grid min-w-44 gap-1 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-xl shadow-black/30">
                    <button
                      type="button"
                      onClick={() => onOpenSettings(notebook.id!)}
                      className="rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                    >
                      Tab settings
                    </button>
                    <button
                      type="button"
                      onClick={() => beginRename(notebook)}
                      className="rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => void onMove(notebook.id!, "left")}
                      className="rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                    >
                      Move left
                    </button>
                    <button
                      type="button"
                      disabled={index === notebooks.length - 1}
                      onClick={() => void onMove(notebook.id!, "right")}
                      className="rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                    >
                      Move right
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete(notebook.id!)}
                      className="rounded-lg px-3 py-2 text-left text-sm text-rose-300 hover:bg-rose-950/40"
                    >
                      Delete notebook
                    </button>
                  </div>
                </details>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={onCreate}
          className="shrink-0 rounded-lg border border-dashed border-slate-600 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-indigo-400 hover:text-white"
          aria-label="Create new notebook"
          title="Create a notebook"
        >
          + New
        </button>
      </div>
    </nav>
  );
}

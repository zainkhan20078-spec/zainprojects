import { useState } from "react";
import { getNotebookSubjects, type Notebook, type NotebookSubject } from "../db";
import { firstEnabledModule } from "../lib/notebookOps";

interface NotebookSidebarProps {
  notebooks: Notebook[];
  activeNotebookId: number | null;
  activeModule: string | null;
  expandedNotebookIds: number[];
  onOpenNotebook: (notebook: Notebook, module: string | null) => void;
  onToggleExpand: (notebookId: number) => void;
  onCreateNotebook: () => void;
  onOpenSettings: (notebookId: number) => void;
  onMoveNotebook: (notebookId: number, direction: "left" | "right") => void;
  onDeleteNotebook: (notebookId: number) => void;
  onAddSubject: (notebookId: number) => void;
  onRenameSubject: (notebookId: number, subject: NotebookSubject) => void;
  onArchiveSubject: (notebookId: number, subject: NotebookSubject) => void;
  onRestoreSubject: (notebookId: number, subject: NotebookSubject) => void;
  onSearch: (query: string) => void;
}

export function NotebookSidebar({
  notebooks,
  activeNotebookId,
  activeModule,
  expandedNotebookIds,
  onOpenNotebook,
  onToggleExpand,
  onCreateNotebook,
  onOpenSettings,
  onMoveNotebook,
  onDeleteNotebook,
  onAddSubject,
  onRenameSubject,
  onArchiveSubject,
  onRestoreSubject,
  onSearch,
}: NotebookSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [query, setQuery] = useState("");

  const searchNeedle = query.trim().toLowerCase();
  const visibleNotebooks = notebooks
    .map((notebook) => ({
      notebook,
      subjects: [...getNotebookSubjects(notebook), ...(notebook.archivedSubjects ?? [])],
    }))
    .filter(({ notebook, subjects }) => {
      return (
        !searchNeedle ||
        notebook.name.toLowerCase().includes(searchNeedle) ||
        subjects.some((subject) => subject.name.toLowerCase().includes(searchNeedle))
      );
    });

  const handOffToSearch = () => {
    if (query.trim()) {
      onSearch(query);
    }
  };

  return (
    <aside className={`workspace-sidebar ${isCollapsed ? "sidebar-collapsed" : ""}`} aria-label="Notebook navigation">
      <div className="sidebar-heading">
        <div>
          <span className="eyebrow">LIBRARY</span>
          <h2>Your notebooks</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onCreateNotebook}
          aria-label="Create notebook"
          title="Create notebook"
        >
          +
        </button>
      </div>
      <div className="sidebar-search">
        <label className="sr-only" htmlFor="sidebar-search">
          Search notebooks and subjects
        </label>
        <input
          id="sidebar-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handOffToSearch();
            }
          }}
          placeholder="Find notebook or subject"
        />
        <button
          type="button"
          aria-label="Search notes and ask AI"
          title="Search notes and ask AI"
          onClick={handOffToSearch}
        >
          ↵
        </button>
      </div>
      <div className="notebook-tree">
        {visibleNotebooks.map(({ notebook }, index) => {
          const notebookId = notebook.id;
          const isCurrentNotebook = notebookId === activeNotebookId;
          const notebookMatches = notebook.name.toLowerCase().includes(searchNeedle);
          const isExpanded = notebookId
            ? (Boolean(searchNeedle) && !notebookMatches) || expandedNotebookIds.includes(notebookId)
            : false;
          const displayedSubjects =
            searchNeedle && !notebookMatches
              ? getNotebookSubjects(notebook).filter((subject) => subject.name.toLowerCase().includes(searchNeedle))
              : getNotebookSubjects(notebook);
          return (
            <section key={notebookId} className="tree-group">
              <div className={isCurrentNotebook ? "tree-folder active" : "tree-folder"}>
                <button
                  type="button"
                  className="folder-select"
                  onClick={() => {
                    onOpenNotebook(notebook, firstEnabledModule(notebook));
                    if (notebookId) {
                      onToggleExpand(notebookId);
                    }
                  }}
                  aria-expanded={isExpanded}
                >
                  <span className="tree-chevron" aria-hidden="true">
                    {isExpanded ? "▾" : "▸"}
                  </span>
                  <span className="folder-icon" aria-hidden="true">
                    ▰
                  </span>
                  <span className="folder-name">{notebook.name}</span>
                </button>
                <details className="folder-options">
                  <summary aria-label={`Options for ${notebook.name}`} title="Notebook options">
                    •••
                  </summary>
                  <div>
                    <button type="button" onClick={() => notebookId && onOpenSettings(notebookId)}>
                      Notebook settings
                    </button>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => notebookId && onMoveNotebook(notebookId, "left")}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      disabled={index === notebooks.length - 1}
                      onClick={() => notebookId && onMoveNotebook(notebookId, "right")}
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      className="danger-action"
                      onClick={() => {
                        if (notebookId && window.confirm(`Delete "${notebook.name}" and its notes?`))
                          onDeleteNotebook(notebookId);
                      }}
                    >
                      Delete notebook
                    </button>
                  </div>
                </details>
              </div>
              {isExpanded && (
                <div className="tree-children">
                  {displayedSubjects.map((subject) => (
                    <div className="tree-subject-row" key={subject.id}>
                      <button
                        type="button"
                        className={
                          isCurrentNotebook && activeModule === subject.id ? "tree-subtab active" : "tree-subtab"
                        }
                        onClick={() => onOpenNotebook(notebook, subject.id)}
                      >
                        <span className="subtab-dot" aria-hidden="true" />
                        {subject.name}
                      </button>
                      <details
                        className="subject-options"
                        onClick={(event) => {
                          if ((event.target as HTMLElement).closest("button")) {
                            const menu = event.currentTarget;
                            window.setTimeout(() => {
                              menu.open = false;
                            }, 0);
                          }
                        }}
                      >
                        <summary aria-label={`Options for ${subject.name}`} title="Subject options">
                          •••
                        </summary>
                        <div>
                          <button type="button" onClick={() => notebookId && onRenameSubject(notebookId, subject)}>
                            Rename subject
                          </button>
                          <button
                            type="button"
                            className="danger-action"
                            onClick={() => notebookId && onArchiveSubject(notebookId, subject)}
                          >
                            Archive subject
                          </button>
                        </div>
                      </details>
                    </div>
                  ))}
                  {notebook.archivedSubjects?.length ? (
                    <details className="archived-tree-menu">
                      <summary>Archived · {notebook.archivedSubjects.length}</summary>
                      <div>
                        {notebook.archivedSubjects.map((subject) => (
                          <div className="archived-tree-row" key={subject.id}>
                            <span>{subject.name}</span>
                            <button type="button" onClick={() => notebookId && onRestoreSubject(notebookId, subject)}>
                              Restore
                            </button>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  <button
                    type="button"
                    className="tree-settings-link"
                    onClick={() => notebookId && onAddSubject(notebookId)}
                  >
                    + Add subject
                  </button>
                </div>
              )}
            </section>
          );
        })}
        {notebooks.length === 0 && <p className="sidebar-empty">Create a notebook to get started.</p>}
      </div>
      <button
        type="button"
        className="sidebar-collapse-button"
        onClick={() => setIsCollapsed((collapsed) => !collapsed)}
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {isCollapsed ? "›" : "‹"}
      </button>
    </aside>
  );
}

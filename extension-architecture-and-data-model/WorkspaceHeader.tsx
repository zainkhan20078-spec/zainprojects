import { useState, type ChangeEvent, type RefObject } from "react";
import type { AIProvider } from "../db";
import { saveApiKey } from "../keyPool";
import type { SyncSnapshot } from "../syncQueue";
import type { WorkspaceMode } from "../lib/notebookOps";
import { SyncStatusIndicator } from "./SyncStatusIndicator";

interface WorkspaceHeaderProps {
  providers: AIProvider[];
  selectedProviderId: number | null;
  onProviderChange: (providerId: number) => void;
  syncSnapshot: SyncSnapshot;
  statusMessage: string;
  isBusy: boolean;
  activeView: WorkspaceMode;
  onNavigate: (view: WorkspaceMode) => void;
  onExport: () => void;
  onImportClick: () => void;
  onImportChange: (event: ChangeEvent<HTMLInputElement>) => void;
  importInputRef: RefObject<HTMLInputElement | null>;
}

const NAV_ITEMS: Array<[WorkspaceMode, string]> = [
  ["editor", "Editor"],
  ["search", "Search"],
  ["analytics", "Analytics"],
  ["help", "Help"],
];

export function WorkspaceHeader({
  providers,
  selectedProviderId,
  onProviderChange,
  syncSnapshot,
  statusMessage,
  isBusy,
  activeView,
  onNavigate,
  onExport,
  onImportClick,
  onImportChange,
  importInputRef,
}: WorkspaceHeaderProps) {
  const [quickApiKey, setQuickApiKey] = useState("");
  const [quickKeyStatus, setQuickKeyStatus] = useState("");

  const handleQuickSaveKey = async () => {
    const providerId = selectedProviderId;
    if (!providerId || !quickApiKey.trim()) {
      setQuickKeyStatus("Choose a provider and enter its API key.");
      return;
    }

    try {
      await saveApiKey({ providerId, key: quickApiKey });
      setQuickApiKey("");
      setQuickKeyStatus("API key saved securely in this browser.");
      window.dispatchEvent(new Event("ai-providers-updated"));
    } catch (error) {
      setQuickKeyStatus(error instanceof Error ? error.message : "Could not save API key.");
    }
  };

  return (
    <header className="hub-bar">
      <div className="brand-block">
        <div className="brand-mark" aria-hidden="true">
          S
        </div>
        <div className="brand-copy">
          <span>2 Bachillerato</span>
          <strong>Study space</strong>
        </div>
      </div>
      <nav className="hub-navigation" aria-label="Workspace views">
        {NAV_ITEMS.map(([view, label]) => (
          <button
            key={view}
            type="button"
            className={activeView === view ? "hub-nav-button active" : "hub-nav-button"}
            aria-current={activeView === view ? "page" : undefined}
            onClick={() => onNavigate(view)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="hub-key-area">
        <label className="sr-only" htmlFor="quick-provider">
          API provider
        </label>
        <select
          id="quick-provider"
          value={selectedProviderId ?? ""}
          onChange={(event) => onProviderChange(Number(event.target.value))}
          aria-label="Provider for API key"
        >
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="quick-api-key">
          API key
        </label>
        <input
          id="quick-api-key"
          type="password"
          value={quickApiKey}
          onChange={(event) => setQuickApiKey(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleQuickSaveKey();
          }}
          placeholder="Add API key"
          autoComplete="off"
        />
        <button type="button" onClick={() => void handleQuickSaveKey()}>
          Save
        </button>
        {quickKeyStatus && (
          <span className="key-save-status" role="status">
            {quickKeyStatus}
          </span>
        )}
      </div>
      <div className="hub-status">
        <SyncStatusIndicator snapshot={syncSnapshot} />
        <details className="backup-menu">
          <summary aria-label="Backup and data actions" title="Backup and data">
            •••
          </summary>
          <div className="backup-menu-panel">
            <strong>Backup & data</strong>
            <button type="button" onClick={onExport} disabled={isBusy}>
              Export backup
            </button>
            <button type="button" onClick={onImportClick} disabled={isBusy}>
              Import backup
            </button>
            <input ref={importInputRef} type="file" accept="application/json" onChange={onImportChange} hidden />
            <span role="status">{statusMessage}</span>
          </div>
        </details>
      </div>
    </header>
  );
}

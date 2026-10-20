import type { SyncSnapshot } from "../syncQueue";

interface SyncStatusIndicatorProps {
  snapshot: SyncSnapshot;
}

const STYLE_BY_STATE: Record<SyncSnapshot["state"], { dot: string; label: string }> = {
  synced: { dot: "bg-emerald-400", label: "Synced to Google Docs" },
  syncing: { dot: "bg-amber-400", label: "Syncing to Google Docs" },
  offline: { dot: "bg-slate-400", label: "Saved on this device" },
  error: { dot: "bg-rose-400", label: "Google Docs sync failed" },
};

export function SyncStatusIndicator({ snapshot }: SyncStatusIndicatorProps) {
  const stateStyle = STYLE_BY_STATE[snapshot.state];

  return (
    <div
      className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-200"
      role="status"
      aria-live="polite"
      title={
        snapshot.state === "error"
          ? snapshot.lastError ?? "Google Docs sync failed. Check your connection and retry."
          : snapshot.state === "offline"
            ? "Notes are saved locally and will sync when you're back online."
            : undefined
      }
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${stateStyle.dot}`} aria-hidden="true" />
      <span>{stateStyle.label}</span>
      {snapshot.queuedCount > 0 && (
        <span className="border-l border-slate-700 pl-2 text-slate-400">
          {snapshot.queuedCount} {snapshot.state === "error" ? "pending" : "queued"}
        </span>
      )}
    </div>
  );
}

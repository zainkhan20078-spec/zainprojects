import { useState } from "react";

export interface ManualAction {
  id: string;
  label: string;
  icon: string;
  hint?: string;
}

interface ManualToolbarProps {
  title: string;
  actions: ManualAction[];
  onAction: (action: ManualAction) => void;
  defaultCollapsed?: boolean;
}

export function ManualToolbar({ title, actions, onAction, defaultCollapsed = true }: ManualToolbarProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-slate-700 bg-slate-900">
      <button
        type="button"
        onClick={() => setCollapsed((current) => !current)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-slate-200"
      >
        <span>{title}</span>
        <span className="text-xs text-slate-400">{collapsed ? "Show" : "Hide"}</span>
      </button>
      {!collapsed && (
        <div className="flex flex-wrap gap-2 border-t border-slate-700 px-3 py-3">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => onAction(action)}
              className="inline-flex items-center gap-2 rounded-md border border-slate-600 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 transition hover:border-indigo-400"
              title={action.hint ?? action.label}
            >
              <span aria-hidden="true">{action.icon}</span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

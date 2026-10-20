import { useState } from "react";
import type { FeatureToggles, Notebook } from "../db";

interface TabSettingsProps {
  notebook: Notebook | null;
  onClose: () => void;
  onSave: (payload: { name: string; featureToggles: FeatureToggles }) => Promise<void>;
}

export function TabSettings({ notebook, onClose, onSave }: TabSettingsProps) {
  const [name, setName] = useState("");
  const [featureToggles, setFeatureToggles] = useState<FeatureToggles>({
    math: true,
    physics: true,
    lengua: true,
    aiChat: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  // Re-sync local fields when a different notebook is opened (React's
  // recommended adjust-state-during-render pattern instead of an effect).
  const [syncedNotebook, setSyncedNotebook] = useState<Notebook | null>(notebook);
  if (notebook !== syncedNotebook) {
    setSyncedNotebook(notebook);
    if (notebook) {
      setName(notebook.name);
      setFeatureToggles(notebook.featureToggles);
    }
  }

  if (!notebook) {
    return null;
  }

  const handleToggleChange = (key: keyof FeatureToggles) => {
    setFeatureToggles((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);

    try {
      await onSave({
        name: name.trim() || notebook.name,
        featureToggles,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <aside className="border-b border-slate-700 bg-slate-900/70 px-4 py-5 sm:px-6">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex items-end justify-between gap-3">
          <div className="w-full max-w-sm">
            <label htmlFor="notebook-name" className="mb-2 block text-sm font-medium text-slate-200">
              Notebook Name
            </label>
            <input
              id="notebook-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-base text-slate-100 outline-none focus:border-indigo-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-100 transition hover:border-slate-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save Tab
            </button>
          </div>
        </div>

        <fieldset className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <legend className="mb-1 text-sm font-medium text-slate-200">Visible Modules</legend>
          <label className="flex items-center gap-2 text-base text-slate-100">
            <input
              type="checkbox"
              checked={featureToggles.math}
              onChange={() => handleToggleChange("math")}
              className="h-4 w-4 accent-indigo-500"
            />
            Math Editor
          </label>
          <label className="flex items-center gap-2 text-base text-slate-100">
            <input
              type="checkbox"
              checked={featureToggles.physics}
              onChange={() => handleToggleChange("physics")}
              className="h-4 w-4 accent-indigo-500"
            />
            Physics Editor
          </label>
          <label className="flex items-center gap-2 text-base text-slate-100">
            <input
              type="checkbox"
              checked={featureToggles.lengua}
              onChange={() => handleToggleChange("lengua")}
              className="h-4 w-4 accent-indigo-500"
            />
            Lengua Editor
          </label>
          <label className="flex items-center gap-2 text-base text-slate-100">
            <input
              type="checkbox"
              checked={featureToggles.aiChat}
              onChange={() => handleToggleChange("aiChat")}
              className="h-4 w-4 accent-indigo-500"
            />
            AI Chat
          </label>
        </fieldset>
      </form>
    </aside>
  );
}

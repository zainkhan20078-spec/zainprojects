import { useEffect, useState } from "react";
import type { ErrorProfile, Notebook } from "../db";
import { ensureDefaultErrorProfile, getErrorProfiles } from "../mistakeEngine";
import {
  injectProfileIntoNotebook,
  restoreNotebookFromLatestBackup,
  type NotebookTextSnapshot,
} from "../notebookInjector";

interface DyslexiaTrainerProps {
  notebook: Notebook;
  content: NotebookTextSnapshot;
}

export function DyslexiaTrainer({ notebook, content }: DyslexiaTrainerProps) {
  const [profiles, setProfiles] = useState<ErrorProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready for local dyslexia training.");

  useEffect(() => {
    const loadProfiles = async () => {
      const defaultId = await ensureDefaultErrorProfile();
      const allProfiles = await getErrorProfiles();
      setProfiles(allProfiles);
      setActiveProfileId((current) => current ?? defaultId);
    };

    void loadProfiles();
  }, []);

  const handleInject = async () => {
    if (!activeProfileId) {
      setStatus("Select an error profile before injecting.");
      return;
    }

    try {
      setBusy(true);
      await injectProfileIntoNotebook({
        notebook,
        content,
        profileId: activeProfileId,
      });
      setStatus("Typos injected into current notebook Google Doc. Clean backup saved locally.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown injection error";
      setStatus(`Injection failed: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    try {
      setBusy(true);
      await restoreNotebookFromLatestBackup(notebook);
      setStatus("Latest clean backup restored into Google Doc.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown restore error";
      setStatus(`Restore failed: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-md border border-slate-700 bg-slate-900 p-4">
      <h3 className="text-lg font-semibold text-slate-100">Dyslexia Trainer</h3>
      <p className="text-sm text-slate-300">
        Local-only typo engine. Protected spans prevent injection into formulas, URLs, numbers, and accented Spanish.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-200" htmlFor="dyslexia-profile">
          Error Profile
        </label>
        <select
          id="dyslexia-profile"
          value={activeProfileId ?? ""}
          onChange={(event) => setActiveProfileId(Number(event.target.value))}
          className="rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleInject()}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
        >
          Inject into Current Notebook
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleRestore()}
          className="rounded-md border border-slate-500 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-300 disabled:opacity-60"
        >
          Restore Clean Notes
        </button>
      </div>

      <p className="text-sm text-slate-300">{status}</p>
    </section>
  );
}

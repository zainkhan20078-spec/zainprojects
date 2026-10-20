import { useMemo, useState } from "react";
import { HOTKEY_REGISTRY } from "../hotkeyRegistry";

export function HelpTab() {
  const [query, setQuery] = useState("");

  const filteredHotkeys = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return HOTKEY_REGISTRY;
    }

    return HOTKEY_REGISTRY.filter((hotkey) => {
      return [hotkey.label, hotkey.description, hotkey.combo, hotkey.scope, hotkey.feature]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [query]);

  return (
    <section className="flex flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <h2 className="text-2xl font-semibold text-slate-100">Help / Instructions</h2>
      <p className="max-w-4xl text-base text-slate-300">
        This panel lists all current hotkeys, macro triggers, and setup instructions for API keys and Google Docs sync.
      </p>

      <div className="max-w-xl">
        <label htmlFor="hotkey-search" className="mb-2 block text-sm font-medium text-slate-200">
          Search Hotkeys
        </label>
        <input
          id="hotkey-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by keybind, action, feature, or description"
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-base text-slate-100 outline-none focus:border-indigo-400"
        />
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-700">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-200">
            <tr>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Keybind</th>
              <th className="px-3 py-2 font-medium">Scope</th>
              <th className="px-3 py-2 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {filteredHotkeys.map((hotkey) => (
              <tr key={hotkey.id} className="border-t border-slate-800 bg-slate-950 text-slate-300">
                <td className="px-3 py-2 text-slate-100">{hotkey.label}</td>
                <td className="px-3 py-2 font-mono">{hotkey.combo}</td>
                <td className="px-3 py-2 uppercase text-slate-400">{hotkey.scope}</td>
                <td className="px-3 py-2">{hotkey.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 text-base text-slate-300">
        <h3 className="text-lg font-medium text-slate-100">API Key Setup</h3>
        <p>
          Open your provider configuration section when available and add provider base URL + model list first, then add
          API key in the local key manager. Keys are stored in IndexedDB locally.
        </p>
        <p>
          Export your full data regularly from the top action bar. This backup includes provider metadata and local
          encrypted-ready key fields, so you can restore on another computer.
        </p>
      </div>

      <div className="space-y-2 text-base text-slate-300">
        <h3 className="text-lg font-medium text-slate-100">Google Docs Sync Setup</h3>
        <p>
          Keep each notebook linked to its Google Doc id. When online, queued edits are pushed automatically. When
          offline, edits remain in IndexedDB queue and flush as soon as connection returns.
        </p>
        <p>
          Use the sync indicator: green means synced, yellow means local changes are syncing, red means offline
          queueing.
        </p>
      </div>
    </section>
  );
}

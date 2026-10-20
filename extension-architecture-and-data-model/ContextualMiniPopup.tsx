import { useEffect, useMemo, useRef, useState } from "react";
import type { FeatureToggles } from "../db";
import { getHotkeysForFeatureSet } from "../hotkeyRegistry";
import { ManualToolbar, type ManualAction } from "./ManualToolbar";

interface ContextualMiniPopupProps {
  features: FeatureToggles;
  onInsert: (token: string, feature: "math" | "physics" | "lengua" | "ai") => void;
}

function toManualActions(features: FeatureToggles): ManualAction[] {
  const actions: ManualAction[] = [];

  if (features.math) {
    actions.push({ id: "math-fraction", label: "Fraction", icon: "a/b", hint: "Insert \\frac" });
    actions.push({ id: "math-derivative", label: "Derivative", icon: "d/dx", hint: "Insert \\der" });
    actions.push({ id: "math-vector", label: "Vector", icon: "->v", hint: "Insert \\vec" });
    actions.push({ id: "math-limit", label: "Limit", icon: "lim", hint: "Insert \\lim" });
  }

  if (features.physics) {
    actions.push({ id: "physics-integral", label: "Integral", icon: "int", hint: "Insert \\int" });
    actions.push({ id: "physics-si", label: "SI", icon: "SI", hint: "Insert SI placeholder" });
    actions.push({ id: "physics-ohm", label: "Ohm", icon: "Ohm", hint: "Insert Ω" });
  }

  if (features.lengua) {
    actions.push({ id: "lengua-a", label: "á", icon: "a~", hint: "Insert á" });
    actions.push({ id: "lengua-n", label: "ñ", icon: "n~", hint: "Insert ñ" });
    actions.push({ id: "lengua-preg", label: "¿", icon: "?", hint: "Insert ¿" });
  }

  return actions;
}

function resolveManualAction(
  actionId: string,
): { feature: "math" | "physics" | "lengua" | "ai"; token: string } | null {
  const map: Record<string, { feature: "math" | "physics" | "lengua" | "ai"; token: string }> = {
    "math-fraction": { feature: "math", token: "\\frac" },
    "math-derivative": { feature: "math", token: "\\der" },
    "math-vector": { feature: "math", token: "\\vec" },
    "math-limit": { feature: "math", token: "\\lim" },
    "physics-integral": { feature: "physics", token: "\\int" },
    "physics-si": { feature: "physics", token: "[SI: ]" },
    "physics-ohm": { feature: "physics", token: "Ω" },
    "lengua-a": { feature: "lengua", token: "á" },
    "lengua-n": { feature: "lengua", token: "ñ" },
    "lengua-preg": { feature: "lengua", token: "¿" },
  };

  return map[actionId] ?? null;
}

export function ContextualMiniPopup({ features, onInsert }: ContextualMiniPopupProps) {
  const [open, setOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  const hotkeys = useMemo(() => getHotkeysForFeatureSet(features), [features]);
  const manualActions = useMemo(() => toManualActions(features), [features]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !popupRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={popupRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="rounded-full border border-slate-600 bg-slate-900 px-2 py-1 text-sm font-semibold text-slate-100 hover:border-indigo-400"
        aria-label="Open contextual help"
      >
        ?
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[24rem] rounded-md border border-slate-700 bg-slate-950 p-3 shadow-lg shadow-black/40">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100">Current Tab Help</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-1 text-xs text-slate-300 hover:bg-slate-800"
            >
              Close
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto rounded-md border border-slate-800">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-300">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Action</th>
                  <th className="px-2 py-1.5 font-medium">Key</th>
                </tr>
              </thead>
              <tbody>
                {hotkeys.map((hotkey) => (
                  <tr key={hotkey.id} className="border-t border-slate-800 text-slate-300">
                    <td className="px-2 py-1.5">{hotkey.label}</td>
                    <td className="px-2 py-1.5 font-mono">{hotkey.combo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3">
            <ManualToolbar
              title="Manual Insert"
              actions={manualActions}
              defaultCollapsed={false}
              onAction={(action) => {
                const resolved = resolveManualAction(action.id);
                if (!resolved) {
                  return;
                }

                onInsert(resolved.token, resolved.feature);
                setOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

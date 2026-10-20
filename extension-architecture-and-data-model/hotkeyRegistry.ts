import type { FeatureToggles } from "./db";

export type HotkeyScope = "global" | "math" | "physics" | "lengua" | "ai";
export type HotkeyFeature = "core" | "math" | "physics" | "lengua" | "ai";

export interface HotkeyDefinition {
  id: string;
  label: string;
  description: string;
  combo: string;
  scope: HotkeyScope;
  feature: HotkeyFeature;
  manualInsert?: string;
  macroToken?: string;
}

export const HOTKEY_REGISTRY: HotkeyDefinition[] = [
  {
    id: "openHelp",
    label: "Open Help Tab",
    description: "Open the global Help / Instructions tab.",
    combo: "ctrl+shift+h",
    scope: "global",
    feature: "core",
  },
  {
    id: "newNotebook",
    label: "Create Notebook",
    description: "Create a new notebook tab.",
    combo: "ctrl+shift+n",
    scope: "global",
    feature: "core",
  },
  {
    id: "exportData",
    label: "Export All Data",
    description: "Export all IndexedDB data to a JSON backup.",
    combo: "ctrl+shift+e",
    scope: "global",
    feature: "core",
  },
  {
    id: "importData",
    label: "Import Data",
    description: "Open file picker to import backup JSON.",
    combo: "ctrl+shift+i",
    scope: "global",
    feature: "core",
  },
  {
    id: "openTabSettings",
    label: "Open Current Tab Settings",
    description: "Open settings for the active notebook tab.",
    combo: "ctrl+,",
    scope: "global",
    feature: "core",
  },
  {
    id: "screenCaptureRead",
    label: "Screen Capture and Read",
    description: "Capture visible tab and OCR text into current notebook.",
    combo: "alt+s",
    scope: "global",
    feature: "core",
  },
  {
    id: "inlineMath",
    label: "Insert Inline Math Block",
    description: "From math text area, inserts an equation block.",
    combo: "ctrl+m",
    scope: "math",
    feature: "math",
  },
  {
    id: "fractionMacro",
    label: "Fraction Macro",
    description: "Type \\frac then Space to create a fraction.",
    combo: "\\frac + space",
    scope: "math",
    feature: "math",
    macroToken: "\\frac",
  },
  {
    id: "derivativeMacro",
    label: "Derivative Macro",
    description: "Type \\der then Space to create derivative layout.",
    combo: "\\der + space",
    scope: "math",
    feature: "math",
    macroToken: "\\der",
  },
  {
    id: "vectorMacro",
    label: "Vector Macro",
    description: "Type \\vec then Space to create vector layout.",
    combo: "\\vec + space",
    scope: "math",
    feature: "math",
    macroToken: "\\vec",
    manualInsert: "\\vec",
  },
  {
    id: "limitMacro",
    label: "Limit Macro",
    description: "Type \\lim then Space to create limit layout.",
    combo: "\\lim + space",
    scope: "math",
    feature: "math",
    macroToken: "\\lim",
  },
  {
    id: "integralMacro",
    label: "Integral Macro",
    description: "Type \\int then Space to create integral layout.",
    combo: "\\int + space",
    scope: "physics",
    feature: "physics",
    macroToken: "\\int",
    manualInsert: "\\int",
  },
  {
    id: "siMacro",
    label: "SI Unit Macro",
    description: "Type \\si then Space to insert SI placeholder.",
    combo: "\\si + space",
    scope: "physics",
    feature: "physics",
    macroToken: "\\si",
    manualInsert: "[SI: ]",
  },
  {
    id: "ohmMacro",
    label: "Ohm Symbol Macro",
    description: "Type \\ohm then Space to insert Omega symbol.",
    combo: "\\ohm + space",
    scope: "physics",
    feature: "physics",
    macroToken: "\\ohm",
    manualInsert: "Ω",
  },
  {
    id: "mpsMacro",
    label: "Speed Unit Macro",
    description: "Type \\mps then Space to insert m/s.",
    combo: "\\mps + space",
    scope: "physics",
    feature: "physics",
    macroToken: "\\mps",
    manualInsert: "m/s",
  },
  {
    id: "accentA",
    label: "Accent A",
    description: "Type \\a then Space to insert a with tilde.",
    combo: "\\a + space",
    scope: "lengua",
    feature: "lengua",
    macroToken: "\\a",
    manualInsert: "á",
  },
  {
    id: "accentE",
    label: "Accent E",
    description: "Type \\e then Space to insert e with tilde.",
    combo: "\\e + space",
    scope: "lengua",
    feature: "lengua",
    macroToken: "\\e",
    manualInsert: "é",
  },
  {
    id: "enye",
    label: "Enye",
    description: "Use macro backslash-n then Space to insert n with tilde.",
    combo: "\\n + space",
    scope: "lengua",
    feature: "lengua",
    macroToken: "\\n",
    manualInsert: "ñ",
  },
  {
    id: "questionOpen",
    label: "Open Spanish Question Mark",
    description: "Type \\abrirpreg then Space to insert opening question mark.",
    combo: "\\abrirpreg + space",
    scope: "lengua",
    feature: "lengua",
    macroToken: "\\abrirpreg",
    manualInsert: "¿",
  },
];

export function getHotkeyById(id: string): HotkeyDefinition | undefined {
  return HOTKEY_REGISTRY.find((hotkey) => hotkey.id === id);
}

export function getHotkeysForFeatureSet(featureToggles: FeatureToggles): HotkeyDefinition[] {
  const enabledFeatures: HotkeyFeature[] = ["core"];
  if (featureToggles.math) enabledFeatures.push("math");
  if (featureToggles.physics) enabledFeatures.push("physics");
  if (featureToggles.lengua) enabledFeatures.push("lengua");
  if (featureToggles.aiChat) enabledFeatures.push("ai");

  return HOTKEY_REGISTRY.filter((hotkey) => enabledFeatures.includes(hotkey.feature));
}

function parseCombo(combo: string): { ctrl: boolean; alt: boolean; shift: boolean; key: string } | null {
  if (combo.includes("\\") || combo.includes("space")) {
    return null;
  }

  const parts = combo.toLowerCase().split("+");
  const key = parts[parts.length - 1];

  return {
    ctrl: parts.includes("ctrl"),
    alt: parts.includes("alt"),
    shift: parts.includes("shift"),
    key,
  };
}

function normalizeEventKey(event: KeyboardEvent): string {
  if (event.key === ",") {
    return ",";
  }

  return event.key.toLowerCase();
}

export function findMatchingGlobalHotkey(event: KeyboardEvent): HotkeyDefinition | null {
  for (const hotkey of HOTKEY_REGISTRY) {
    if (hotkey.scope !== "global") {
      continue;
    }

    const parsed = parseCombo(hotkey.combo);
    if (!parsed) {
      continue;
    }

    if (event.ctrlKey !== parsed.ctrl || event.altKey !== parsed.alt || event.shiftKey !== parsed.shift) {
      continue;
    }

    if (normalizeEventKey(event) === parsed.key) {
      return hotkey;
    }
  }

  return null;
}

import { applyMistakeProfile, ensureDefaultErrorProfile } from "./mistakeEngine";
import { buildHighlightDirectives, type DocumentBlueprint } from "./documentBlueprint";

export interface DocsExecutionResult {
  ok: boolean;
  docId?: string;
  appliedHeading?: string;
  warning?: string;
}

interface DocHeading {
  text: string;
  level: string;
  startIndex: number;
  endIndex: number;
}

interface StructureResponse {
  ok: boolean;
  docId?: string;
  headings?: DocHeading[];
  error?: string;
}

interface ExecuteResponse {
  ok: boolean;
  docId?: string;
  appliedHeading?: string;
  error?: string;
}

function ensureRuntime(): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    throw new Error("Chrome runtime messaging unavailable.");
  }
}

async function sendMessage<T>(message: Record<string, unknown>): Promise<T> {
  ensureRuntime();
  return (await chrome.runtime.sendMessage(message)) as T;
}

export async function readDocumentStructure(targetName: string): Promise<{ docId: string; headings: DocHeading[] }> {
  const response = await sendMessage<StructureResponse>({
    type: "READ_DOC_STRUCTURE",
    payload: { targetName },
  });

  if (!response.ok || !response.docId) {
    throw new Error(response.error ?? "Unable to read document structure.");
  }

  return {
    docId: response.docId,
    headings: response.headings ?? [],
  };
}

export async function executeBlueprintWrite(params: {
  blueprint: DocumentBlueprint;
  text: string;
}): Promise<DocsExecutionResult> {
  let writeText = params.text;

  if (params.blueprint.addDyslexiaTypos) {
    const profileId = await ensureDefaultErrorProfile();
    writeText = await applyMistakeProfile({
      profileId,
      text: writeText,
      intensity: 0.5,
    });
  }

  const highlights = params.blueprint.highlightImportant ? buildHighlightDirectives(writeText) : [];

  const response = await sendMessage<ExecuteResponse>({
    type: "EXECUTE_DOC_BLUEPRINT",
    payload: {
      blueprint: params.blueprint,
      text: writeText,
      highlights,
    },
  });

  if (!response.ok) {
    throw new Error(response.error ?? "Document execution failed.");
  }

  return {
    ok: true,
    docId: response.docId,
    appliedHeading: response.appliedHeading,
  };
}

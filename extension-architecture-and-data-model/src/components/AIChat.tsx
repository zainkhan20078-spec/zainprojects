import { useEffect, useMemo, useState } from "react";
import { generateWithProvider, routeAIRequest } from "../aiRouter";
import { executeBlueprintWrite, readDocumentStructure } from "../deepDocsExecutor";
import { runWebAgent, type AgentAction, type AgentMode } from "../webAgent";
import type { AIProvider } from "../db";
import { parseNaturalCommand } from "../naturalCommandParser";
import {
  deleteApiKey,
  addCustomProvider,
  listKeysForProvider,
  listProviders,
  saveApiKey,
  type ProviderRegistry,
} from "../keyPool";

interface AIChatProps {
  notebookContext: string;
  currentValue: string;
  selectedProviderId: number | null;
  onProviderChange: (providerId: number) => void;
  onAppendToNotebook: (text: string) => void;
  registry?: ProviderRegistry;
}

export function AIChat({
  notebookContext,
  currentValue,
  selectedProviderId,
  onProviderChange,
  onAppendToNotebook,
  registry,
}: AIChatProps) {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<number | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("AI router ready.");
  const [busy, setBusy] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [routeMeta, setRouteMeta] = useState<{ route: string; tokens: number } | null>(null);
  const [providerKeyCount, setProviderKeyCount] = useState<Record<number, number>>({});
  const [headingsPreview, setHeadingsPreview] = useState<string[]>([]);
  const [agentMode, setAgentMode] = useState<AgentMode>("watch");
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentGoal, setAgentGoal] = useState("");
  const [customProviderName, setCustomProviderName] = useState("");
  const [customProviderBaseUrl, setCustomProviderBaseUrl] = useState("");
  const [customProviderModels, setCustomProviderModels] = useState("");
  const [isAddingProvider, setIsAddingProvider] = useState(false);

  const currentProviderId = selectedProviderId ?? activeProviderId;
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === currentProviderId) ?? null,
    [providers, currentProviderId],
  );

  const refreshProviders = async () => {
    const loaded = await listProviders();
    setProviders(loaded);
    const counts: Record<number, number> = {};
    for (const provider of loaded) {
      if (!provider.id) {
        continue;
      }
      counts[provider.id] = (await listKeysForProvider(provider.id)).length;
    }
    setProviderKeyCount(counts);
  };

  useEffect(() => {
    // Initial load + subscription; setState happens in async continuations.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshProviders();
    const refreshOnProviderChange = () => void refreshProviders();
    window.addEventListener("ai-providers-updated", refreshOnProviderChange);
    return () => window.removeEventListener("ai-providers-updated", refreshOnProviderChange);
  }, []);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
      return;
    }

    const listener = (message: unknown) => {
      if (!message || typeof message !== "object" || !("type" in message)) {
        return;
      }

      const typed = message as { type: string; payload?: { message?: string } };
      if (typed.type === "CAPTCHA_MANUAL_REQUIRED") {
        setStatus(typed.payload?.message ?? "CAPTCHA needs manual solve. Please complete it in the page.");
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  const handleSaveKey = async () => {
    if (!currentProviderId || !keyInput.trim()) {
      setStatus("Select provider and paste a key.");
      return;
    }

    await saveApiKey({ providerId: currentProviderId, key: keyInput.trim() });
    setKeyInput("");
    setStatus("API key encrypted and saved locally.");
    await refreshProviders();
    window.dispatchEvent(new Event("ai-providers-updated"));
  };

  const handleDeleteNewestKey = async () => {
    if (!currentProviderId) {
      return;
    }

    const keys = await listKeysForProvider(currentProviderId);
    const newest = [...keys].sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0];
    if (!newest?.id) {
      setStatus("No key to delete for this provider.");
      return;
    }

    await deleteApiKey(newest.id);
    setStatus("Latest key removed for selected provider.");
    await refreshProviders();
    window.dispatchEvent(new Event("ai-providers-updated"));
  };

  const handleAddProvider = async () => {
    try {
      const providerId = await addCustomProvider({
        name: customProviderName,
        baseUrl: customProviderBaseUrl,
        models: customProviderModels.split(","),
      });
      setCustomProviderName("");
      setCustomProviderBaseUrl("");
      setCustomProviderModels("");
      await refreshProviders();
      onProviderChange(providerId);
      window.dispatchEvent(new Event("ai-providers-updated"));
      setStatus("Custom provider added. Paste its API key above to use it.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to add custom provider.");
    } finally {
      setIsAddingProvider(false);
    }
  };

  const handleSendToSelectedProvider = async () => {
    if (!prompt.trim()) {
      setStatus("Write a request before sending.");
      return;
    }
    if (!selectedProvider) {
      setStatus("Select or add an AI provider first.");
      return;
    }

    try {
      setBusy(true);
      setStatus(`Sending directly to ${selectedProvider.name}...`);
      const result = await generateWithProvider(selectedProvider, prompt, notebookContext);
      setResponseText(result.text);
      setRouteMeta({ route: result.routeTaken, tokens: result.tokensUsed });
      onAppendToNotebook(result.text);
      setStatus(`Response received from ${selectedProvider.name} and added to this notebook.`);
      setPrompt("");
    } catch (error) {
      setStatus(`Request failed: ${error instanceof Error ? error.message : "Unknown provider error"}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async () => {
    if (!prompt.trim()) {
      setStatus("Write a request before sending.");
      return;
    }

    try {
      setBusy(true);
      const parsed = parseNaturalCommand(prompt);
      setStatus("Routing through orchestrator...");

      const result = await routeAIRequest(
        {
          prompt: parsed.cleanedInstruction,
          notebookContext,
        },
        registry,
      );

      setResponseText(result.text);
      setRouteMeta({ route: result.routeTaken, tokens: result.tokensUsed });
      onAppendToNotebook(result.text);

      const execution = await executeBlueprintWrite({
        blueprint: parsed.blueprint,
        text: result.text,
      });

      setStatus(
        `Answer generated. Docs action ${parsed.blueprint.action} applied to ${parsed.blueprint.targetName}${
          execution.appliedHeading ? ` under section ${execution.appliedHeading}` : ""
        }.`,
      );
      setPrompt("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown routing error";
      setStatus(`AI routing failed: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleReadStructure = async () => {
    try {
      const parsed = parseNaturalCommand(prompt || "append to current notebook doc");
      const structure = await readDocumentStructure(parsed.blueprint.targetName);
      setHeadingsPreview(structure.headings.map((heading) => `${heading.level}: ${heading.text}`));
      setStatus(`Loaded ${structure.headings.length} headings from ${parsed.blueprint.targetName}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Structure read failed";
      setStatus(`Structure read failed: ${message}`);
    }
  };

  const handleRunAgent = async () => {
    if (!agentGoal.trim()) {
      setStatus("Write an automation goal first.");
      return;
    }

    try {
      setAgentBusy(true);
      await runWebAgent({
        goal: agentGoal,
        mode: agentMode,
        onStatus: (message) => setStatus(`Web Agent: ${message}`),
        requestPermission: async (action: AgentAction) => {
          const label = `${action.type}${action.targetHint ? ` -> ${action.targetHint}` : ""}`;
          return window.confirm(`Approve action: ${label}?`);
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent failed";
      setStatus(`Web Agent failed: ${message}`);
    } finally {
      setAgentBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-indigo-300">AI study assistant</p>
        <h3 className="mt-1 text-lg font-semibold text-white">Ask a question</h3>
        <p className="mt-1 text-sm text-slate-400">Choose an AI provider, add its API key, then send a request.</p>
      </div>

      <details className="group rounded-xl border border-slate-800 bg-slate-950/50">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-200 hover:text-slate-100 [&::-webkit-details-marker]:hidden">
          Advanced key management
          <span className="ml-2 text-xs font-normal text-slate-500">
            View provider selection, key count, and remove-key action
          </span>
        </summary>
        <div className="grid gap-3 border-t border-slate-800 p-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="provider-select" className="block text-sm text-slate-200">
              Provider
            </label>
            <select
              id="provider-select"
              value={currentProviderId ?? ""}
              onChange={(event) => {
                const nextId = Number(event.target.value);
                setActiveProviderId(nextId);
                onProviderChange(nextId);
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400">
              Saved keys: {selectedProvider?.id ? (providerKeyCount[selectedProvider.id] ?? 0) : 0}
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="provider-key" className="block text-sm text-slate-200">
              Add another API key
            </label>
            <input
              id="provider-key"
              type="password"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              placeholder="Paste your provider API key"
              autoComplete="off"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleSaveKey()}
                className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400"
              >
                Save API key
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteNewestKey()}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-500"
              >
                Remove latest key
              </button>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">
              Keys are encrypted and stored in this browser. Requests go directly to the selected AI provider.
            </p>
          </div>
        </div>
      </details>

      <details className="group rounded-xl border border-slate-800 bg-slate-950/40">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-200 hover:text-white [&::-webkit-details-marker]:hidden">
          Add another AI provider
          <span className="ml-2 text-xs font-normal text-slate-500">OpenAI-compatible API</span>
        </summary>
        <div className="grid gap-3 border-t border-slate-800 p-4 sm:grid-cols-2">
          <p className="text-sm leading-relaxed text-slate-400 sm:col-span-2">
            For AI text-generation services that support the OpenAI chat-completions format. Enter the API base URL (for
            example, ending in <code className="text-slate-300">/v1</code>) and model IDs from that provider. This does
            not support unrelated APIs such as payments or SMS.
          </p>
          <label className="space-y-1 text-sm text-slate-300">
            <span>Provider name</span>
            <input
              value={customProviderName}
              onChange={(event) => setCustomProviderName(event.target.value)}
              placeholder="My AI provider"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
            />
          </label>
          <label className="space-y-1 text-sm text-slate-300">
            <span>API base URL</span>
            <input
              type="url"
              value={customProviderBaseUrl}
              onChange={(event) => setCustomProviderBaseUrl(event.target.value)}
              placeholder="https://api.example.com/v1"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
            />
          </label>
          <label className="space-y-1 text-sm text-slate-300 sm:col-span-2">
            <span>Model IDs (comma-separated)</span>
            <input
              value={customProviderModels}
              onChange={(event) => setCustomProviderModels(event.target.value)}
              placeholder="model-name, another-model"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
            />
          </label>
          <button
            type="button"
            disabled={isAddingProvider}
            onClick={() => {
              setIsAddingProvider(true);
              void handleAddProvider();
            }}
            className="w-fit rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-200 transition hover:bg-indigo-500/20 disabled:opacity-50 sm:col-span-2"
          >
            Add provider
          </button>
        </div>
      </details>

      <div className="space-y-2">
        <label htmlFor="ai-request" className="block text-sm text-slate-200">
          Request
        </label>
        <textarea
          id="ai-request"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Natural command examples: Put this in a new doc called 'Thermodynamics Summary'. Add this to the Thermodynamics section and highlight what is important."
          className="h-28 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSendToSelectedProvider()}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {busy ? "Sending..." : `Send to ${selectedProvider?.name ?? "provider"}`}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSend()}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:border-slate-500 disabled:opacity-60"
          >
            {busy ? "Routing..." : "Use automatic router"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleReadStructure()}
            className="rounded-md border border-slate-500 px-4 py-2 text-sm text-slate-100 hover:border-slate-300 disabled:opacity-60"
          >
            Read Target Headings
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-md border border-slate-700 bg-slate-950 p-3">
        <p className="text-sm font-medium text-slate-100">Agent Mode Controls</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-200" htmlFor="agent-mode">
            Mode
          </label>
          <select
            id="agent-mode"
            value={agentMode}
            onChange={(event) => setAgentMode(event.target.value as AgentMode)}
            className="rounded-md border border-slate-600 bg-slate-900 px-3 py-1.5 text-sm text-slate-100"
          >
            <option value="watch">Watch Mode (default)</option>
            <option value="auto">Auto Mode</option>
          </select>
        </div>
        <textarea
          value={agentGoal}
          onChange={(event) => setAgentGoal(event.target.value)}
          placeholder="Example: Open the first result for thermodynamics notes and fill the search box with entropy equation."
          className="h-20 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
        />
        <button
          type="button"
          disabled={agentBusy}
          onClick={() => void handleRunAgent()}
          className="rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-400 disabled:opacity-60"
        >
          {agentBusy ? "Running Agent..." : "Run Web Agent"}
        </button>
        <p className="text-xs text-slate-400">
          In Watch Mode every action asks permission. In Auto Mode destructive actions still require confirmation.
        </p>
      </div>

      {headingsPreview.length > 0 && (
        <div className="rounded-md border border-slate-700 bg-slate-950 p-3">
          <p className="mb-2 text-sm font-medium text-slate-100">Document Structure</p>
          <p className="whitespace-pre-wrap text-xs text-slate-300">{headingsPreview.join("\n")}</p>
        </div>
      )}

      {responseText && (
        <div className="space-y-2 rounded-md border border-slate-700 bg-slate-950 p-3">
          <p className="text-sm font-medium text-slate-100">Latest Response</p>
          <p className="whitespace-pre-wrap text-sm text-slate-300">{responseText}</p>
        </div>
      )}

      {routeMeta && (
        <p className="text-xs text-slate-400">
          Route: {routeMeta.route} | Approx tokens: {routeMeta.tokens}
        </p>
      )}

      <p className="text-sm text-slate-300">{status}</p>
      <p className="text-xs text-slate-500">Notebook AI field length: {currentValue.length} chars</p>
    </section>
  );
}

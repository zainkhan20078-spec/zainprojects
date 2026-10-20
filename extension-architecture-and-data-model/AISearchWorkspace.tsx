import { useEffect, useMemo, useRef, useState } from "react";
import { generateWithProvider } from "../aiRouter";
import type { AIProvider } from "../db";
import { ingestFiles } from "../fileIngestor";
import { searchGoogleDrive, type GoogleDriveSearchResult } from "../googleDocsApi";
import { captureAndReadScreen } from "../screenReader";
import { readCurrentPage } from "../webAgent";
import { getGoogleSearchEngineId, saveGoogleSearchConfig, type GoogleWebSearchResult } from "../googleSearch";

export interface AISearchSource {
  notebookName: string;
  subjectName: string;
  text: string;
}

interface AISearchWorkspaceProps {
  initialQuery: string;
  sources: AISearchSource[];
  providers: AIProvider[];
  selectedProviderId: number | null;
}

interface LocalMatch extends AISearchSource {
  excerpt: string;
}

function findLocalMatches(sources: AISearchSource[], query: string): LocalMatch[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 1);
  if (terms.length === 0) return [];

  return sources
    .map((source) => {
      const lowerText = source.text.toLowerCase();
      const score = terms.reduce((count, term) => count + (lowerText.includes(term) ? 1 : 0), 0);
      if (score === 0) return null;
      const firstIndex = lowerText.indexOf(terms.find((term) => lowerText.includes(term)) ?? "");
      return {
        ...source,
        score,
        excerpt: source.text.slice(Math.max(0, firstIndex - 100), firstIndex + 360).trim(),
      };
    })
    .filter((result): result is LocalMatch & { score: number } => result !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export function AISearchWorkspace({ initialQuery, sources, providers, selectedProviderId }: AISearchWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [answer, setAnswer] = useState("");
  const [attachedText, setAttachedText] = useState("");
  const [activePageText, setActivePageText] = useState("");
  const [driveResults, setDriveResults] = useState<GoogleDriveSearchResult[]>([]);
  const [webResults, setWebResults] = useState<GoogleWebSearchResult[]>([]);
  const [searchApiKey, setSearchApiKey] = useState("");
  const [searchEngineId, setSearchEngineId] = useState("");
  const [searchConfigStatus, setSearchConfigStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const provider = providers.find((item) => item.id === selectedProviderId) ?? null;
  const localMatches = useMemo(() => findLocalMatches(sources, query), [sources, query]);

  useEffect(() => {
    void getGoogleSearchEngineId()
      .then((engineId) => {
        if (engineId) {
          setSearchEngineId(engineId);
          setSearchConfigStatus("Saved Google Search settings are ready.");
        }
      })
      .catch((error: unknown) => {
        setSearchConfigStatus(error instanceof Error ? error.message : "Could not load Google Search settings.");
      });
  }, []);

  // Pick up a new hand-off query from the sidebar (adjust-during-render
  // pattern instead of an effect).
  const [lastInitialQuery, setLastInitialQuery] = useState(initialQuery);
  if (initialQuery !== lastInitialQuery) {
    setLastInitialQuery(initialQuery);
    setQuery(initialQuery);
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      setBusy(true);
      const imported = await ingestFiles(Array.from(files));
      setAttachedText((current) => [current, imported.combinedText].filter(Boolean).join("\n\n"));
      setStatus(
        imported.warnings.length
          ? `Added ${imported.items.length} files. Some files could not be read: ${imported.warnings.join("; ")}`
          : `Added ${imported.items.length} file(s) to this search.`,
      );
    } catch (error) {
      setStatus(`File import failed: ${error instanceof Error ? error.message : "Unknown file error"}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDriveSearch = async () => {
    if (!query.trim()) {
      setStatus("Enter a phrase to search in Google Drive.");
      return;
    }
    try {
      setBusy(true);
      setDriveResults([]);
      setStatus("Requesting Google Drive access and searching matching files...");
      const results = await searchGoogleDrive(query);
      setDriveResults(results);
      setStatus(
        results.length
          ? `Found ${results.length} Drive file(s). Only matching results are read for this search.`
          : "No matching Drive files found. Make sure the Google account has granted Drive access.",
      );
    } catch (error) {
      setStatus(`Google Drive search failed: ${error instanceof Error ? error.message : "Unknown Drive error"}`);
    } finally {
      setBusy(false);
    }
  };

  const handleReadPage = async () => {
    try {
      setBusy(true);
      const page = await readCurrentPage();
      setActivePageText(`Page: ${page.title}\nURL: ${page.url}\n\n${page.text}`);
      setStatus(`Read the current page (“${page.title}”). Its text is available to your next AI question.`);
    } catch (error) {
      setStatus(`Could not read this page: ${error instanceof Error ? error.message : "Unknown page error"}`);
    } finally {
      setBusy(false);
    }
  };

  const handleReadScreen = async () => {
    try {
      setBusy(true);
      setStatus("Reading visible screen with OCR...");
      const result = await captureAndReadScreen();
      setActivePageText((current) => [current, `Screen OCR:\n${result.extractedText}`].filter(Boolean).join("\n\n"));
      setStatus("Screen text read with OCR and added as AI context.");
    } catch (error) {
      setStatus(`Screen OCR failed: ${error instanceof Error ? error.message : "Unknown OCR error"}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSearchConfig = async () => {
    try {
      await saveGoogleSearchConfig(searchApiKey, searchEngineId);
      setSearchApiKey("");
      setSearchConfigStatus("Search settings saved on this device.");
    } catch (error) {
      setSearchConfigStatus(error instanceof Error ? error.message : "Could not save Google Search settings.");
    }
  };

  const handleWebSearch = async () => {
    if (!query.trim()) {
      setStatus("Enter a phrase before searching the web.");
      return;
    }
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      setStatus("Background web search is available from the installed Chrome extension.");
      return;
    }
    try {
      setBusy(true);
      setWebResults([]);
      setStatus("Searching the web in the extension background...");
      const response = (await chrome.runtime.sendMessage({
        type: "SEARCH_PUBLIC_WEB",
        payload: { query: query.trim() },
      })) as { ok: boolean; error?: string; results?: GoogleWebSearchResult[] };
      if (!response.ok) {
        throw new Error(response.error ?? "Google web search failed.");
      }
      setWebResults(response.results ?? []);
      setStatus(
        response.results?.length
          ? `Found ${response.results.length} web result(s). Nothing was opened in a new tab.`
          : "No web results found.",
      );
    } catch (error) {
      setStatus(`Web search failed: ${error instanceof Error ? error.message : "Unknown search error"}`);
    } finally {
      setBusy(false);
    }
  };

  const handleAskAI = async () => {
    const prompt = query.trim();
    if (!prompt) {
      setStatus("Type a question or search request first.");
      return;
    }
    if (!provider) {
      setStatus("Choose a provider and save its API key in the top bar first.");
      return;
    }

    const selectedLocalContext = localMatches
      .map((match) => `Notebook: ${match.notebookName} / ${match.subjectName}\n${match.excerpt}`)
      .join("\n\n");
    const selectedDriveContext = driveResults
      .map((result) => `Google Drive file: ${result.name}\n${result.text.slice(0, 5000)}`)
      .join("\n\n");
    const selectedWebContext = webResults
      .map((result) => `Web result: ${result.title}\nURL: ${result.link}\n${result.snippet}`)
      .join("\n\n");
    const context = [
      attachedText && `User-attached files:\n${attachedText.slice(0, 12000)}`,
      activePageText && `User-requested page/screen context:\n${activePageText.slice(0, 12000)}`,
      selectedLocalContext && `Matching notebook notes:\n${selectedLocalContext.slice(0, 10000)}`,
      selectedDriveContext && `Matching Google Drive files:\n${selectedDriveContext.slice(0, 10000)}`,
      selectedWebContext && `Google Search results:\n${selectedWebContext.slice(0, 10000)}`,
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");

    try {
      setBusy(true);
      setStatus(`Asking ${provider.name}...`);
      const result = await generateWithProvider(
        provider,
        `Help the student solve or answer this request. If it is a math or science problem, show clear steps. If source material is provided, use it and distinguish evidence from your own explanation.\n\nRequest:\n${prompt}`,
        context,
      );
      setAnswer(result.text);
      setStatus(`Answered by ${provider.name} using ${result.routeTaken}.`);
    } catch (error) {
      setStatus(`AI request failed: ${error instanceof Error ? error.message : "Unknown AI error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ai-search-workspace">
      <header className="ai-search-intro">
        <span className="eyebrow">AI SEARCH & STUDY</span>
        <h2>Ask, solve, and search your study material</h2>
        <p>Ask a question to get an explanation, or add sources below when you want AI to use them.</p>
      </header>

      <div className="ai-search-compose">
        <label htmlFor="ai-search-query">What do you want help with?</label>
        <textarea
          id="ai-search-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ask a math question, explain a concept, or find something in your notes..."
          rows={4}
        />
        <div className="ai-search-actions">
          <button type="button" className="ai-primary-button" disabled={busy} onClick={() => void handleAskAI()}>
            {busy ? "Working..." : `Ask ${provider?.name ?? "AI"}`}
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            Add files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.txt,.md,.docx,.png,.jpg,.jpeg,.zip,.rar"
            hidden
            onChange={(event) => {
              void handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <button type="button" disabled={busy} onClick={() => void handleDriveSearch()}>
            Search Google Drive
          </button>
          <button type="button" disabled={busy} onClick={() => void handleWebSearch()}>
            Search web
          </button>
        </div>
        <div className="ai-context-actions">
          <button type="button" disabled={busy} onClick={() => void handleReadPage()}>
            Read current webpage
          </button>
          <button type="button" disabled={busy} onClick={() => void handleReadScreen()}>
            Read visible screen (OCR)
          </button>
          <span>Page reading and OCR happen only when you click these buttons.</span>
        </div>
        <p className="ai-search-status" role="status" aria-live="polite">
          {status}
        </p>
      </div>

      <details className="google-search-settings">
        <summary>Set up tab-free Google web search</summary>
        <div>
          <p>
            Enter a Google Programmable Search API key and Search Engine ID. The key is encrypted in this browser.
            Google receives your search query when you search.
          </p>
          <label htmlFor="google-search-api-key">Custom Search API key</label>
          <input
            id="google-search-api-key"
            type="password"
            value={searchApiKey}
            onChange={(event) => setSearchApiKey(event.target.value)}
            autoComplete="off"
            placeholder="Google API key"
          />
          <label htmlFor="google-search-engine-id">Programmable Search Engine ID</label>
          <input
            id="google-search-engine-id"
            type="text"
            value={searchEngineId}
            onChange={(event) => setSearchEngineId(event.target.value)}
            autoComplete="off"
            placeholder="Search Engine ID (cx)"
          />
          <button type="button" onClick={() => void handleSaveSearchConfig()}>
            Save search settings
          </button>
          <span role="status">{searchConfigStatus}</span>
        </div>
      </details>

      {(attachedText || activePageText) && (
        <div className="ai-source-summary">
          <strong>Context ready</strong>
          {attachedText && <span>Uploaded file text added ({attachedText.length.toLocaleString()} characters)</span>}
          {activePageText && <span>Page/screen text added ({activePageText.length.toLocaleString()} characters)</span>}
          <button
            type="button"
            onClick={() => {
              setAttachedText("");
              setActivePageText("");
            }}
          >
            Clear added context
          </button>
        </div>
      )}

      {query.trim() && (
        <div className="ai-local-results">
          <h3>
            Matching notebook notes <span>{localMatches.length}</span>
          </h3>
          {localMatches.length ? (
            localMatches.map((match) => (
              <article key={`${match.notebookName}-${match.subjectName}`}>
                <strong>
                  {match.notebookName} <span>· {match.subjectName}</span>
                </strong>
                <p>{match.excerpt}</p>
              </article>
            ))
          ) : (
            <p className="ai-search-muted">No matching notebook notes. You can still ask AI or search Drive/web.</p>
          )}
        </div>
      )}

      {driveResults.length > 0 && (
        <div className="ai-local-results">
          <h3>
            Google Drive results <span>{driveResults.length}</span>
          </h3>
          {driveResults.map((result) => (
            <article key={result.id}>
              <strong>
                {result.url ? (
                  <a href={result.url} target="_blank" rel="noreferrer">
                    {result.name}
                  </a>
                ) : (
                  result.name
                )}
              </strong>
              <p>
                {result.text.slice(0, 400) ||
                  "This file was found by name or metadata, but its text format could not be previewed."}
              </p>
            </article>
          ))}
        </div>
      )}

      {webResults.length > 0 && (
        <div className="ai-local-results">
          <h3>
            Google web results <span>{webResults.length}</span>
          </h3>
          {webResults.map((result) => (
            <article key={result.link}>
              <strong>
                <a href={result.link} target="_blank" rel="noreferrer">
                  {result.title}
                </a>
              </strong>
              <p>{result.snippet}</p>
              <small>{result.link}</small>
            </article>
          ))}
        </div>
      )}

      {answer && (
        <article className="ai-answer-card">
          <h3>AI response</h3>
          <div>{answer}</div>
        </article>
      )}
      <p className="ai-search-disclaimer">
        AI answers use your selected provider and may be incorrect. Web searches run through Google Programmable Search
        in the extension background; results do not open tabs unless you click a result link. Drive search asks Google
        for access when first used and reads only matching files.
      </p>
    </section>
  );
}

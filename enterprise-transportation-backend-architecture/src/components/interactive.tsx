"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type ApiResult = {
  ok?: boolean;
  summary?: string;
  message?: string;
  error?: string;
  routed?: string;
  duplicate?: boolean;
  [key: string]: unknown;
};

const describeResult = (result: ApiResult): string => {
  if (result.duplicate) return "Duplicate event suppressed (idempotency key matched).";
  if (result.summary) return String(result.summary);
  if (result.message) return String(result.message);
  if (result.error) return `Error: ${String(result.error)}`;
  return result.ok === false ? "Request rejected by the orchestrator." : "Completed.";
};

export function ApiActionButton({
  label,
  busyLabel,
  endpoint,
  method = "POST",
  tone = "ghost",
  body,
  refresh = true,
}: {
  label: string;
  busyLabel?: string;
  endpoint: string;
  method?: "POST" | "GET" | "PUT";
  tone?: "gold" | "ghost";
  body?: Record<string, unknown>;
  refresh?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    setBusy(true);
    setResult(null);
    setFailed(false);
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      });
      const payload = (await response.json()) as ApiResult;
      setFailed(!response.ok || payload.ok === false);
      setResult(describeResult(payload));
      if (refresh) startTransition(() => router.refresh());
    } catch (error) {
      setFailed(true);
      setResult(error instanceof Error ? error.message : "Network failure.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy || pending}
        className={`btn ${tone === "gold" ? "btn-gold" : "btn-ghost"}`}
      >
        {busy || pending ? (busyLabel ?? "Working…") : label}
      </button>
      {result ? (
        <p className={`text-[11px] leading-relaxed ${failed ? "text-bad" : "text-good"}`}>{result}</p>
      ) : null}
    </div>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost !px-2 !py-1 !text-[9px]"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export type SimulatorScenario = {
  key: string;
  label: string;
  description: string;
  eventType: string;
  module: string;
};

export function EventSimulator({ scenarios }: { scenarios: SimulatorScenario[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(scenarios[0]?.key ?? "quote-sedan");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string; routed?: string } | null>(null);
  const active = scenarios.find((scenario) => scenario.key === selected);

  const run = async () => {
    setBusy(true);
    setOutcome(null);
    try {
      const response = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: selected }),
      });
      const payload = (await response.json()) as ApiResult;
      setOutcome({
        ok: response.ok && payload.ok !== false,
        text: describeResult(payload),
        routed: typeof payload.routed === "string" ? payload.routed : undefined,
      });
      router.refresh();
    } catch (error) {
      setOutcome({
        ok: false,
        text: error instanceof Error ? error.message : "Simulation failed.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="eyebrow">Provider payload</span>
        <select
          className="select mt-2"
          value={selected}
          onChange={(event) => {
            setSelected(event.target.value);
            setOutcome(null);
          }}
        >
          {scenarios.map((scenario) => (
            <option key={scenario.key} value={scenario.key}>
              {scenario.label}
            </option>
          ))}
        </select>
      </label>
      {active ? (
        <div className="rounded-sm border border-hairline bg-black/20 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mono text-[10px] uppercase tracking-[0.12em] text-gold">{active.eventType}</span>
            <span className="mono text-[10px] text-[#71777f]">→ module {active.module}</span>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{active.description}</p>
        </div>
      ) : null}
      <button type="button" onClick={run} disabled={busy} className="btn btn-gold w-full">
        {busy ? "Processing event…" : "Deliver event through pipeline"}
      </button>
      {outcome ? (
        <div
          className={`rounded-sm border p-3 text-[11.5px] leading-relaxed ${
            outcome.ok ? "border-good/40 bg-good/[0.06] text-good" : "border-bad/40 bg-bad/[0.06] text-bad"
          }`}
        >
          {outcome.routed ? <span className="mono mr-2 text-[10px] uppercase">{outcome.routed}</span> : null}
          {outcome.text}
        </div>
      ) : null}
      <p className="mono text-[9.5px] leading-relaxed text-[#5d636c]">
        Runs the production consumer · signature recorded as simulated · Claude falls back deterministically when no
        API key is present.
      </p>
    </div>
  );
}

export type KnowledgeDocView = {
  slug: string;
  name: string;
  category: string;
  description: string;
  xmlContent: string;
  version: number;
  updatedAt: string;
};

export function KnowledgeEditor({ documents }: { documents: KnowledgeDocView[] }) {
  const router = useRouter();
  const [activeSlug, setActiveSlug] = useState(documents[0]?.slug ?? "");
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(documents.map((doc) => [doc.slug, doc.xmlContent])),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const active = documents.find((doc) => doc.slug === activeSlug);

  const save = async () => {
    if (!active) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/knowledge", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: active.slug, xmlContent: drafts[active.slug] }),
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string; error?: string };
      if (response.ok && payload.ok !== false) {
        setMessage({ ok: true, text: `Saved · version ${active.version + 1}. Injected into every subsequent Claude call.` });
        router.refresh();
      } else {
        setMessage({ ok: false, text: payload.message ?? payload.error ?? "Save rejected." });
      }
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Save failed." });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    if (!active) return;
    setDrafts((current) => ({ ...current, [active.slug]: active.xmlContent }));
    setMessage(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {documents.map((doc) => (
          <button
            key={doc.slug}
            type="button"
            onClick={() => {
              setActiveSlug(doc.slug);
              setMessage(null);
            }}
            className={`rounded-sm border px-2.5 py-1.5 text-[10.5px] transition-colors ${
              doc.slug === activeSlug
                ? "border-gold-soft/70 bg-gold/10 text-gold"
                : "border-hairline text-muted hover:border-gold-soft/40 hover:text-ivory"
            }`}
          >
            {doc.name}
          </button>
        ))}
      </div>

      {active ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="mono text-[10px] uppercase tracking-[0.14em] text-gold">{active.slug}</p>
              <p className="mt-1 text-[11.5px] text-muted">{active.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-ghost" onClick={reset} disabled={busy}>
                Revert
              </button>
              <button type="button" className="btn btn-gold" onClick={save} disabled={busy}>
                {busy ? "Saving…" : "Save version"}
              </button>
            </div>
          </div>
          <textarea
            className="textarea scroll-thin min-h-[420px]"
            value={drafts[active.slug] ?? ""}
            onChange={(event) =>
              setDrafts((current) => ({ ...current, [active.slug]: event.target.value }))
            }
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="mono text-[9.5px] text-[#5d636c]">
              v{active.version} · updated {active.updatedAt} · {drafts[active.slug]?.length ?? 0} chars
            </p>
            {message ? (
              <p className={`text-[11px] ${message.ok ? "text-good" : "text-bad"}`}>{message.text}</p>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-[12px] text-muted">No knowledge artifacts seeded.</p>
      )}
    </div>
  );
}

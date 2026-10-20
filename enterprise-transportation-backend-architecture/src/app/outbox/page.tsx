import Link from "next/link";
import { Badge, Empty, Field, PageHeader, Panel, StatusPill, formatFullDateTime } from "@/components/ui";
import { getArtifact, listArtifacts } from "@/lib/queries";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "", label: "All artifacts" },
  { key: "gmail_draft", label: "Gmail drafts" },
  { key: "slack_message", label: "Slack messages" },
  { key: "sheets_row", label: "Sheets rows" },
] as const;

type OutboxSearchParams = { artifact?: string; kind?: string };

export default async function OutboxPage({
  searchParams,
}: {
  searchParams: Promise<OutboxSearchParams>;
}) {
  const params = await searchParams;
  const all = await listArtifacts(100);
  const kind = params.kind ?? "";
  const rows = kind ? all.filter((row) => row.kind === kind) : all;
  const selected = params.artifact ? await getArtifact(params.artifact) : rows[0] ?? null;
  const metadata = (selected?.metadata ?? {}) as Record<string, unknown>;
  const isDraft = selected?.kind === "gmail_draft";
  const isSlack = selected?.kind === "slack_message";
  const isSheet = selected?.kind === "sheets_row";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Outbox · human approval queue"
        title="Drafts, alerts and audit rows — exactly as produced."
        description="No outbound email is sent by this system. Gmail drafts wait for the reservations desk or controller. Slack posts and Sheets rows are the only live writes, and both are labelled with the producing run id."
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((tab) => (
          <Link
            key={tab.key || "all"}
            href={tab.key ? `/outbox?kind=${tab.key}` : "/outbox"}
            className={`rounded-sm border px-2.5 py-1.5 text-[10.5px] transition-colors ${
              kind === tab.key
                ? "border-gold-soft/70 bg-gold/10 text-gold"
                : "border-hairline text-muted hover:border-gold-soft/40 hover:text-ivory"
            }`}
          >
            {tab.label}
            <span className="mono ml-1.5 text-[9px] text-[#5d636c]">
              {tab.key ? all.filter((row) => row.kind === tab.key).length : all.length}
            </span>
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Panel title="Outbox" eyebrow="Delivery adapters">
          <Empty
            title="Nothing staged yet"
            body="Deliver a quote or past-due invoice from the simulator. The resulting Gmail draft, Slack card and Sheets row will appear here with full provenance."
          />
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
          <Panel title="Artifacts" eyebrow={`${rows.length} recorded`} bodyClassName="p-0" className="h-fit">
            <ul className="max-h-[720px] divide-y divide-[#1b1e23] overflow-y-auto scroll-thin">
              {rows.map((artifact) => (
                <li key={artifact.id}>
                  <Link
                    href={`/outbox?artifact=${artifact.id}${kind ? `&kind=${kind}` : ""}`}
                    className={`block px-3.5 py-3 transition-colors hover:bg-white/[0.03] ${
                      selected?.id === artifact.id ? "bg-gold/[0.06]" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="mono text-[9px] uppercase tracking-[0.12em] text-gold-soft">
                        {artifact.kind.replace(/_/g, " ")}
                      </span>
                      <StatusPill status={artifact.mode} />
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug text-ivory">{artifact.title}</p>
                    <p className="mono mt-1 text-[9px] text-[#5d636c]">
                      {artifact.target} · {formatFullDateTime(artifact.createdAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          {selected ? (
            <div className="space-y-4">
              <Panel
                eyebrow={`${selected.provider} · ${selected.target}`}
                title={selected.title}
                action={
                  selected.url ? (
                    <a href={selected.url} target="_blank" rel="noreferrer" className="btn btn-ghost">
                      Open destination
                    </a>
                  ) : (
                    <Badge tone="slate">{selected.mode === "simulated" ? "Simulated delivery" : "Delivered"}</Badge>
                  )
                }
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <div>
                    {isDraft ? (
                      <div className="letter p-5 sm:p-7">
                        <div className="border-b border-[#d9d2c2] pb-3">
                          <p className="mono text-[9px] uppercase tracking-[0.18em] text-[#8b8064]">
                            Personal Sedan Services · Gmail draft
                          </p>
                          <p className="display mt-1.5 text-[15px] leading-snug text-[#1b1a17]">{selected.title}</p>
                          <p className="mono mt-1 text-[10px] text-[#6c6555]">
                            To: {String(metadata.recipient ?? "dispatch")} · Draft only, not sent
                          </p>
                        </div>
                        <div className="letter-body mt-4 text-[#262420]">{selected.body}</div>
                      </div>
                    ) : isSlack ? (
                      <div className="rounded-sm border border-hairline bg-[#0b0d10] p-4">
                        <div className="flex items-center gap-2">
                          <span className="grid h-7 w-7 place-items-center rounded-sm bg-gold/15 text-[11px] text-gold">
                            PSS
                          </span>
                          <div>
                            <p className="text-[12px] text-ivory">PSS Automation</p>
                            <p className="mono text-[9px] text-[#71777f]">{selected.target}</p>
                          </div>
                          <StatusPill status={selected.mode} />
                        </div>
                        <div className="mt-3 border-l-2 border-gold-soft pl-3">
                          <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#d7dbe0]">
                            {selected.body}
                          </p>
                        </div>
                        <p className="mono mt-3 text-[9px] text-[#5d636c]">
                          Slack webhook reference: {selected.reference}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {isSheet ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {Object.entries(JSON.parse(selected.body) as Record<string, unknown>).map(([key, value]) => (
                              <div key={key} className="rounded-sm border border-hairline px-2.5 py-2">
                                <p className="mono text-[8.5px] uppercase tracking-[0.12em] text-[#71777f]">
                                  {key.replace(/_/g, " ")}
                                </p>
                                <p className="mt-1 text-[11px] leading-relaxed text-ivory">{String(value)}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <pre className="code-block scroll-thin">{selected.body}</pre>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 border-t border-hairline pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                    <Field label="Artifact id" value={selected.id} mono />
                    <Field label="Run id" value={selected.runId ?? "—"} mono />
                    <Field label="Reference" value={selected.reference} mono />
                    <Field label="Recipient" value={String(metadata.recipient ?? "—")} />
                    {metadata.guardrail ? (
                      <Field label="Pricing guardrail" value={String(metadata.guardrail)} />
                    ) : null}
                    {metadata.escalationLevel ? (
                      <Field label="Escalation level" value={String(metadata.escalationLevel)} />
                    ) : null}
                    {metadata.internalNote ? (
                      <Field label="Internal note" value={String(metadata.internalNote)} />
                    ) : null}
                    {metadata.model ? <Field label="Model" value={String(metadata.model)} /> : null}
                    <Field label="Created" value={formatFullDateTime(selected.createdAt)} />
                    {selected.runId ? (
                      <Link
                        href={`/workflows/${selected.runId}`}
                        className="mt-1 inline-block text-[10px] uppercase tracking-[0.13em] text-gold hover:text-ivory"
                      >
                        Inspect producing run →
                      </Link>
                    ) : null}
                  </div>
                </div>
              </Panel>

              {Array.isArray(metadata.riskFlags) && metadata.riskFlags.length > 0 ? (
                <Panel title="Dispatch verification" eyebrow="Risk flags">
                  <ul className="space-y-2">
                    {(metadata.riskFlags as string[]).map((flag) => (
                      <li key={flag} className="flex gap-2 text-[11.5px] leading-relaxed text-warn">
                        <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-warn" />
                        {flag}
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

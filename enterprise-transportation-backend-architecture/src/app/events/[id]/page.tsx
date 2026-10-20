import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiActionButton, CopyButton } from "@/components/interactive";
import { Badge, Field, PageHeader, Panel, StatusPill, formatFullDateTime } from "@/components/ui";
import { getEvent } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event, runs, artifacts } = await getEvent(id);
  if (!event) notFound();

  const normalized = event.normalized as Record<string, unknown> | null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Event · ${event.eventType}`}
        title={event.eventId}
        description={`Received ${formatFullDateTime(event.receivedAt)} via ${event.transport} transport. Signature ${event.signatureStatus}; routing ${event.routing}.`}
        actions={
          <>
            <Link href="/events" className="btn btn-ghost">
              Back to ledger
            </Link>
            <ApiActionButton label="Replay event" busyLabel="Replaying…" endpoint={`/api/events/${event.id}/replay`} tone="gold" />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={event.status} />
        <StatusPill status={event.signatureStatus} />
        <Badge tone="slate">{event.transport}</Badge>
        <Badge tone="gold">{event.routing}</Badge>
        {event.error ? <span className="text-[11px] text-bad">{event.error}</span> : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Raw provider payload"
          eyebrow="Persisted verbatim"
          action={<CopyButton value={JSON.stringify(event.payload, null, 2)} label="Copy JSON" />}
          bodyClassName="p-3"
        >
          <pre className="code-block scroll-thin max-h-[440px]">{JSON.stringify(event.payload, null, 2)}</pre>
        </Panel>

        <Panel
          title="Canonical model"
          eyebrow="After validation"
          action={normalized ? <CopyButton value={JSON.stringify(normalized, null, 2)} label="Copy JSON" /> : null}
          bodyClassName="p-3"
        >
          {normalized ? (
            <pre className="code-block scroll-thin max-h-[440px]">{JSON.stringify(normalized, null, 2)}</pre>
          ) : (
            <p className="p-3 text-[12px] text-muted">
              No canonical model stored. Validation may have failed before normalization — replay after correcting the
              provider payload.
            </p>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Workflow runs triggered" eyebrow="Execution ledger" bodyClassName="p-0">
          {runs.length === 0 ? (
            <p className="p-4 text-[12px] text-muted">No workflow ran for this event (monitoring or ingestion-only route).</p>
          ) : (
            <div className="overflow-x-auto scroll-thin">
              <table className="table-grid">
                <thead>
                  <tr>
                    <th>Module</th>
                    <th>Status</th>
                    <th>Mode</th>
                    <th>Latency</th>
                    <th>Tokens</th>
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td>
                        <Link href={`/workflows/${run.id}`} className="text-gold hover:text-ivory">
                          {run.module}
                        </Link>
                      </td>
                      <td>
                        <StatusPill status={run.status} />
                      </td>
                      <td className="mono text-[10px] uppercase text-[#9aa0a8]">{run.mode}</td>
                      <td className="mono text-[10px] text-[#9aa0a8]">{run.latencyMs}ms</td>
                      <td className="mono text-[10px] text-[#9aa0a8]">
                        {run.inputTokens + run.outputTokens}
                      </td>
                      <td className="max-w-[360px] text-[11px] leading-relaxed text-[#c3c8cf]">
                        {run.summary ?? "—"}
                        {run.error ? <span className="mt-1 block text-[10px] text-bad">{run.error}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Delivery metadata" eyebrow="Audit">
            <Field label="Event row id" value={event.id} mono />
            <Field label="Provider event id" value={event.eventId} mono />
            <Field label="Attempts" value={event.attempts} />
            <Field label="Received" value={formatFullDateTime(event.receivedAt)} />
            <Field label="Processed" value={event.processedAt ? formatFullDateTime(event.processedAt) : "pending"} />
            <Field label="Error" value={event.error ?? "none"} />
          </Panel>

          <Panel title="Generated artifacts" eyebrow="Outbox">
            {artifacts.length === 0 ? (
              <p className="text-[11.5px] leading-relaxed text-muted">
                No artifacts. This event may not produce external output.
              </p>
            ) : (
              <ul className="space-y-2">
                {artifacts.map((artifact) => (
                  <li key={artifact.id} className="border-b border-[#1b1e23] pb-2 last:border-b-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="mono text-[9px] uppercase tracking-[0.12em] text-gold-soft">
                        {artifact.kind.replace(/_/g, " ")}
                      </span>
                      <StatusPill status={artifact.mode} />
                    </div>
                    <Link
                      href={`/outbox?artifact=${artifact.id}`}
                      className="mt-1 block text-[11.5px] text-ivory hover:text-gold"
                    >
                      {artifact.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

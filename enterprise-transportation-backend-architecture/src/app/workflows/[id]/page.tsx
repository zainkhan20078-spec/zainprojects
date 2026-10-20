import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Field, PageHeader, Panel, StatusPill, formatFullDateTime } from "@/components/ui";
import { getRun } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { run, artifacts } = await getRun(id);
  if (!run) notFound();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Run · Module ${run.module}`}
        title={run.summary ?? "Workflow execution"}
        description={`Triggered by ${run.trigger}${run.eventId ? ` for provider event ${run.eventId}` : ""}. Started ${formatFullDateTime(run.startedAt)}.`}
        actions={
          <Link href="/workflows" className="btn btn-ghost">
            Workflow registry
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={run.status} />
        <StatusPill status={run.mode} />
        <Badge tone="slate">{run.model ?? "deterministic"}</Badge>
        <Badge tone="slate">{run.retries} retries</Badge>
        <Badge tone="slate">{(run.inputTokens + run.outputTokens).toLocaleString()} tokens</Badge>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Panel title="Structured output" eyebrow="Validated JSON" bodyClassName="p-3">
            <pre className="code-block scroll-thin max-h-[420px]">
              {JSON.stringify(run.output ?? {}, null, 2)}
            </pre>
          </Panel>

          <Panel title="Artifacts produced" eyebrow="Delivery adapters" bodyClassName="p-0">
            {artifacts.length === 0 ? (
              <p className="p-4 text-[12px] text-muted">No external artifacts produced by this run.</p>
            ) : (
              <div className="overflow-x-auto scroll-thin">
                <table className="table-grid">
                  <thead>
                    <tr>
                      <th>Kind</th>
                      <th>Target</th>
                      <th>Title</th>
                      <th>Reference</th>
                      <th>Mode</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {artifacts.map((artifact) => (
                      <tr key={artifact.id}>
                        <td className="mono text-[10px] uppercase text-[#9aa0a8]">{artifact.kind.replace(/_/g, " ")}</td>
                        <td className="mono text-[10px] text-[#9aa0a8]">{artifact.target}</td>
                        <td className="text-[11.5px] text-ivory">{artifact.title}</td>
                        <td className="mono max-w-[180px] truncate text-[10px] text-[#71777f]">{artifact.reference}</td>
                        <td>
                          <StatusPill status={artifact.mode} />
                        </td>
                        <td>
                          <Link
                            href={`/outbox?artifact=${artifact.id}`}
                            className="text-[10px] uppercase tracking-[0.13em] text-gold hover:text-ivory"
                          >
                            Open →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Execution telemetry" eyebrow="Cost & latency">
            <Field label="Run id" value={run.id} mono />
            <Field label="Event id" value={run.eventId ?? "n/a"} mono />
            <Field label="Started" value={formatFullDateTime(run.startedAt)} />
            <Field label="Finished" value={run.finishedAt ? formatFullDateTime(run.finishedAt) : "in flight"} />
            <Field label="Latency" value={`${run.latencyMs} ms`} />
            <Field label="Input tokens" value={run.inputTokens.toLocaleString()} />
            <Field label="Output tokens" value={run.outputTokens.toLocaleString()} />
            <Field label="Retries" value={run.retries} />
          </Panel>

          {run.error ? (
            <Panel title="Degradation / error" eyebrow="Operator attention">
              <p className="text-[11.5px] leading-relaxed text-bad">{run.error}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                A degraded run still delivered an artifact using the deterministic composer. Review the draft before
                dispatching.
              </p>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { Empty, PageHeader, Panel, StatusPill, formatFullDateTime, formatWindow } from "@/components/ui";
import { listEvents } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const events = await listEvents(80);
  const failed = events.filter((event) => event.status === "failed").length;
  const duplicates = events.filter((event) => event.status === "duplicate").length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Webhook ledger"
        title="Every dispatch event, durable and replayable."
        description="The consumer persists the raw provider payload before normalization, then records the canonical model, the routing decision and any failure. Replay mints a new event id so retries never masquerade as new business events."
        actions={
          <Link href="/architecture#endpoints" className="btn btn-ghost">
            Endpoint contract
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          { label: "Events retained", value: events.length },
          { label: "Processed", value: events.filter((event) => event.status === "processed").length },
          { label: "Failed / replayable", value: failed },
          { label: "Duplicates suppressed", value: duplicates },
        ].map((item) => (
          <div key={item.label} className="panel-flat p-3">
            <p className="eyebrow text-[9px]">{item.label}</p>
            <p className="stat-value mt-1.5 text-ivory">{item.value}</p>
          </div>
        ))}
      </div>

      <Panel title="Delivery ledger" eyebrow="Newest first" bodyClassName="p-0">
        {events.length === 0 ? (
          <div className="p-5">
            <Empty
              title="No events ingested yet"
              body="POST a payload to /api/webhooks/limo-anywhere or use the Demo Delivery panel on the Overview page."
            />
          </div>
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="table-grid">
              <thead>
                <tr>
                  <th>Received (PT)</th>
                  <th>Event id</th>
                  <th>Type</th>
                  <th>Transport</th>
                  <th>Signature</th>
                  <th>Status</th>
                  <th>Route</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="mono whitespace-nowrap text-[10px] text-[#9aa0a8]">
                      {formatWindow(event.receivedAt)}
                    </td>
                    <td className="mono max-w-[210px] truncate text-[10px] text-[#71777f]">{event.eventId}</td>
                    <td className="whitespace-nowrap text-[11.5px] text-ivory">{event.eventType}</td>
                    <td className="mono text-[10px] uppercase text-[#9aa0a8]">{event.transport}</td>
                    <td>
                      <StatusPill status={event.signatureStatus} />
                    </td>
                    <td>
                      <StatusPill status={event.status} />
                    </td>
                    <td className="mono text-[10px] text-[#9aa0a8]">{event.routing}</td>
                    <td>
                      <Link
                        href={`/events/${event.id}`}
                        className="text-[10px] uppercase tracking-[0.13em] text-gold hover:text-ivory"
                      >
                        Inspect →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="mono text-[9.5px] leading-relaxed text-[#5d636c]">
        Retry semantics: Limo Anywhere re-deliveries return HTTP 200 with the original row. Failures return 4xx/5xx so
        the provider retries, and the raw payload remains available for a controlled replay.
      </p>
    </div>
  );
}

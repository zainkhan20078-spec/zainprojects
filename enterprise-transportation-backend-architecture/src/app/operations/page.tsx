import { ApiActionButton } from "@/components/interactive";
import { Badge, Empty, PageHeader, Panel, StatusPill, formatDateTime, formatFullDateTime } from "@/components/ui";
import { BRAND, WORKFLOW_CONFIG } from "@/lib/config";
import { formatUsd } from "@/lib/pricing";
import { listCommunications, listInvoices, listReservations, listShifts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const [reservations, invoices, shifts, communications] = await Promise.all([
    listReservations(12),
    listInvoices(),
    listShifts(8),
    listCommunications(8),
  ]);

  const escalatable = invoices.filter(
    (invoice) => invoice.daysPastDue > WORKFLOW_CONFIG.arEscalationDays && invoice.status !== "escalated",
  );
  const inquiries = communications.filter((item) => item.channel === "email");
  const transcripts = communications.filter((item) => item.channel === "phone");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations ledger"
        title="Reservations, receivables and the 24-hour dispatch batch."
        description="The orchestrator's source of truth after Limo Anywhere events are normalized. Receivables can be escalated on demand; the policy gate still refuses accounts inside the grace window."
        actions={
          <ApiActionButton label="Sweep receivables" endpoint="/api/cron/ar-escalation" tone="gold" />
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Quotes & reservations", value: reservations.length, hint: "Module A candidates" },
          { label: "Open receivables", value: invoices.filter((invoice) => invoice.status !== "resolved").length, hint: `${escalatable.length} past the ${WORKFLOW_CONFIG.arEscalationDays}-day gate` },
          { label: "Shifts captured", value: shifts.length, hint: "Rolling into Module C" },
          { label: "Communications · 24h", value: communications.length, hint: `${transcripts.length} transcripts` },
        ].map((item) => (
          <div key={item.label} className="panel-flat p-3.5">
            <p className="eyebrow text-[9px]">{item.label}</p>
            <p className="stat-value mt-2 text-ivory">{item.value}</p>
            <p className="mono mt-1.5 text-[10px] text-[#71777f]">{item.hint}</p>
          </div>
        ))}
      </div>

      <Panel title="Quote & reservation intake" eyebrow="Module A queue" bodyClassName="p-0">
        {reservations.length === 0 ? (
          <div className="p-5">
            <Empty
              title="No reservations captured"
              body="Deliver a Quote.Requested fixture from the Overview demo panel. The guardrail reconciliation and draft will appear here."
            />
          </div>
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="table-grid">
              <thead>
                <tr>
                  <th>Passenger</th>
                  <th>Pickup</th>
                  <th>Vehicle</th>
                  <th>Dispatch fare</th>
                  <th>Guardrail</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((reservation) => {
                  const breakdown = reservation.quoteBreakdown as Record<string, unknown>;
                  const guardrail = String(breakdown.guardrail ?? "review");
                  return (
                    <tr key={reservation.id}>
                      <td>
                        <p className="text-ivory">{reservation.passengerName}</p>
                        <p className="mono text-[9.5px] text-[#71777f]">
                          {reservation.corporateName ?? "Retail"} · {reservation.passengers} pax
                        </p>
                      </td>
                      <td className="max-w-[260px]">
                        <p className="text-[11.5px] text-[#c3c8cf]">{formatDateTime(reservation.pickupDatetime)}</p>
                        <p className="text-[10.5px] leading-relaxed text-[#8d939b]">
                          {reservation.pickupLocation} → {reservation.dropoffLocation}
                        </p>
                      </td>
                      <td className="text-[11.5px] text-[#c3c8cf]">{reservation.vehicleTypeRequested}</td>
                      <td className="mono whitespace-nowrap text-[11px] text-ivory">
                        {formatUsd(reservation.quotedFare)}
                      </td>
                      <td>
                        <StatusPill status={guardrail === "match" ? "verified" : "pending"} label={guardrail} />
                      </td>
                      <td>
                        <StatusPill status={reservation.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Accounts receivable"
        eyebrow={`Escalation gate · ${WORKFLOW_CONFIG.arEscalationDays} days`}
        action={<Badge tone="slate">Module B</Badge>}
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto scroll-thin">
          <table className="table-grid">
            <thead>
              <tr>
                <th>Corporate account</th>
                <th>Invoice</th>
                <th>Balance</th>
                <th>Days past due</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const due = invoice.daysPastDue > WORKFLOW_CONFIG.arEscalationDays;
                return (
                  <tr key={invoice.id}>
                    <td>
                      <p className="text-ivory">{invoice.corporateName}</p>
                      <p className="mono text-[9.5px] text-[#71777f]">{invoice.billingContactEmail}</p>
                    </td>
                    <td className="mono text-[11px] text-[#c3c8cf]">{invoice.invoiceNumber}</td>
                    <td className="mono text-[11px] text-gold">{formatUsd(invoice.balanceDue)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-16 overflow-hidden rounded-full bg-white/5">
                          <div
                            className={`h-full ${due ? "bg-warn" : "bg-good/60"}`}
                            style={{ width: `${Math.min(100, (invoice.daysPastDue / 90) * 100)}%` }}
                          />
                        </div>
                        <span className="mono text-[10px] text-[#9aa0a8]">{invoice.daysPastDue}d</span>
                      </div>
                    </td>
                    <td>
                      <StatusPill status={invoice.status} />
                    </td>
                    <td>
                      {due && invoice.status !== "escalated" ? (
                        <ApiActionButton
                          label="Escalate"
                          busyLabel="Drafting…"
                          endpoint={`/api/invoices/${invoice.id}/escalate`}
                        />
                      ) : (
                        <span className="mono text-[9.5px] uppercase tracking-[0.1em] text-[#5d636c]">
                          {invoice.status === "escalated" ? "Awaiting remittance" : "Monitoring"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-hairline px-4 py-3">
          <p className="mono text-[9.5px] leading-relaxed text-[#5d636c]">
            Relationship handling: {BRAND.name} has served Clark County since {BRAND.established}. Escalation language is
            graded courtesy / firm / final by days past due.
          </p>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Completed shifts" eyebrow="Shift.Completed ingestion" bodyClassName="p-0">
          <div className="overflow-x-auto scroll-thin">
            <table className="table-grid">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Completed</th>
                  <th>Trips</th>
                  <th>Revenue</th>
                  <th>Incidents</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((shift) => (
                  <tr key={shift.id}>
                    <td>
                      <p className="text-ivory">{shift.driverName ?? shift.driverId}</p>
                      <p className="mono text-[9px] text-[#71777f]">{shift.driverId}</p>
                    </td>
                    <td className="mono whitespace-nowrap text-[10px] text-[#9aa0a8]">
                      {formatDateTime(shift.completedAt)}
                    </td>
                    <td className="mono text-[11px] text-ivory">{shift.tripsCompleted}</td>
                    <td className="mono text-[11px] text-gold">{formatUsd(shift.totalRevenue)}</td>
                    <td>
                      {shift.incidentFlags.length === 0 ? (
                        <span className="mono text-[9.5px] uppercase text-good">clear</span>
                      ) : (
                        <span className="text-[10.5px] leading-relaxed text-warn">
                          {shift.incidentFlags.join(" · ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Module C batch preview" eyebrow="Trailing 24 hours">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="panel-flat px-2.5 py-2">
                <p className="text-[8.5px] uppercase tracking-[0.12em] text-[#71777f]">Email inquiries</p>
                <p className="mono mt-1 text-[14px] text-ivory">{inquiries.length}</p>
              </div>
              <div className="panel-flat px-2.5 py-2">
                <p className="text-[8.5px] uppercase tracking-[0.12em] text-[#71777f]">Phone transcripts</p>
                <p className="mono mt-1 text-[14px] text-ivory">{transcripts.length}</p>
              </div>
              <div className="panel-flat px-2.5 py-2">
                <p className="text-[8.5px] uppercase tracking-[0.12em] text-[#71777f]">Shifts</p>
                <p className="mono mt-1 text-[14px] text-ivory">{shifts.length}</p>
              </div>
            </div>
            <ul className="space-y-2">
              {communications.slice(0, 5).map((item) => (
                <li key={item.id} className="border-b border-[#1b1e23] pb-2 last:border-b-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11.5px] text-ivory">
                      {item.customerName}
                      <span className="mono ml-2 text-[9px] uppercase text-[#71777f]">{item.channel}</span>
                    </span>
                    <span
                      className={`mono text-[9.5px] ${
                        item.responseTimeSeconds > 900 ? "text-bad" : "text-good"
                      }`}
                    >
                      {Math.round(item.responseTimeSeconds / 60)}m reply
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[10.5px] leading-relaxed text-[#8d939b]">{item.content}</p>
                  <p className="mono mt-1 text-[9px] text-[#5d636c]">{formatFullDateTime(item.receivedAt)}</p>
                </li>
              ))}
            </ul>
            <ApiActionButton label="Run daily audit now" endpoint="/api/cron/daily-audit" tone="gold" />
          </div>
        </Panel>
      </div>
    </div>
  );
}

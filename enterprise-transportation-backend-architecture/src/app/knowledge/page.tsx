import { CopyButton, KnowledgeEditor } from "@/components/interactive";
import { Badge, Empty, PageHeader, Panel } from "@/components/ui";
import { buildSystemPrompt } from "@/lib/claude/prompts";
import { listKnowledge, listPricingRules } from "@/lib/queries";
import { formatUsd } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const PROJECT_SCHEMA = `<claude_project>
  <name>Personal Sedan Services — Dispatch Concierge</name>
  <system_instructions>
    You are the Elite Virtual Concierge for Personal Sedan Services, established 2000,
    headquartered in Las Vegas, Nevada. Hyper-formal, concise, highly respectful,
    luxury-focused, zero fluff. You draft; humans approve.
  </system_instructions>

  <knowledge_artifacts>
    <fleet_manifest>… staging rules for Sedans, VIP SUVs, Executive Sprinters …</fleet_manifest>
    <las_airport_procedures>… baggage-claim meet-and-greet vs. curbside at LAS …</las_airport_procedures>
    <corporate_pricing_rules>… convention flat rates vs. mileage billing constraints …</corporate_pricing_rules>
  </knowledge_artifacts>

  <pricing_guardrail source="server">
    Injected per request from the deterministic pricing engine.
    Authoritative amounts only. Never recompute, round or invent.
  </pricing_guardrail>
</claude_project>`;

export default async function KnowledgePage() {
  const [documents, rules] = await Promise.all([listKnowledge(), listPricingRules()]);
  const systemPrompt = buildSystemPrompt(
    documents.map((doc) => ({ slug: doc.slug, name: doc.name, xmlContent: doc.xmlContent })),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Claude Projects · contextual knowledge"
        title="The house rules the model is not permitted to improvise."
        description="The three required XML artifacts — fleet manifest, LAS airport procedures and corporate pricing rules — are versioned in Postgres and injected into every Claude call as project knowledge. Editing an artifact changes the next draft, not the historical record."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel
          title="Knowledge artifacts"
          eyebrow="Editable · versioned"
          action={<Badge tone="slate">{documents.length} active</Badge>}
        >
          {documents.length === 0 ? (
            <Empty title="No artifacts" body="The knowledge base is empty. Reseed the application to restore the defaults." />
          ) : (
            <KnowledgeEditor
              documents={documents.map((doc) => ({
                slug: doc.slug,
                name: doc.name,
                category: doc.category,
                description: doc.description,
                xmlContent: doc.xmlContent,
                version: doc.version,
                updatedAt: doc.updatedAt.toISOString(),
              }))}
            />
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Project shell" eyebrow="System instructions">
            <pre className="code-block scroll-thin text-[9.5px] leading-relaxed">{PROJECT_SCHEMA}</pre>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              The runtime equivalent is assembled by <span className="mono text-[10.5px] text-gold">buildSystemPrompt()</span>.
              The same artifacts can be pasted into a Claude Project as Knowledge files for analyst use.
            </p>
          </Panel>

          <Panel
            title="Pricing guardrails"
            eyebrow="Deterministic engine"
            action={<Badge tone="gold">USD</Badge>}
            bodyClassName="p-0"
          >
            {rules.length === 0 ? (
              <p className="p-4 text-[12px] text-muted">No pricing rules configured.</p>
            ) : (
              <div className="overflow-x-auto scroll-thin">
                <table className="table-grid">
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Airport flat</th>
                      <th>Hourly min</th>
                      <th>Per mile</th>
                      <th>Gratuity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule) => (
                      <tr key={rule.id}>
                        <td>
                          <p className="text-ivory">{rule.displayName}</p>
                          <p className="mono text-[9px] text-[#71777f]">
                            {rule.passengerCapacity} pax · {rule.baggageCapacity} bags
                          </p>
                        </td>
                        <td className="mono text-[11px] text-ivory">{formatUsd(rule.flatAirportRate)}</td>
                        <td className="mono text-[11px] text-[#c3c8cf]">{formatUsd(rule.hourlyMinimum)}</td>
                        <td className="mono text-[11px] text-[#c3c8cf]">{formatUsd(rule.perMileRate)}</td>
                        <td className="mono text-[11px] text-[#c3c8cf]">{Number(rule.gratuityPct).toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Panel
        title="Rendered system prompt"
        eyebrow="Sent with every completion"
        action={<CopyButton value={systemPrompt} label="Copy prompt" />}
        bodyClassName="p-3"
      >
        <pre className="code-block scroll-thin max-h-[460px] text-[9.5px] leading-relaxed">{systemPrompt}</pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="slate">Role: Elite Virtual Concierge</Badge>
          <Badge tone="slate">Voice: hyper-formal · zero fluff</Badge>
          <Badge tone="slate">Guardrail: no hallucinated fares</Badge>
          <Badge tone="slate">Governance: humans send</Badge>
        </div>
      </Panel>

      <Panel title="Why the guardrail lives outside the model" eyebrow="Design note">
        <p className="text-[12px] leading-relaxed text-muted">
          Language models are reliable composers but unreliable calculators. Rather than asking Claude to price a trip,
          this system resolves the lane, applies the vehicle-class rule, itemizes airport fees, fuel and gratuity, then
          injects the finished XML block into the prompt. The model is told the amounts are authoritative and forbidden
          from arithmetic. When the dispatch fare deviates by more than five percent, the guardrail flags the draft for
          human review instead of silently reconciling it.
        </p>
      </Panel>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview", note: "OPS" },
  { href: "/operations", label: "Operations", note: "AR" },
  { href: "/events", label: "Event Stream", note: "WH" },
  { href: "/workflows", label: "Workflows", note: "A·B·C" },
  { href: "/outbox", label: "Drafts & Outbox", note: "OUT" },
  { href: "/knowledge", label: "Knowledge Base", note: "XML" },
  { href: "/architecture", label: "Architecture", note: "DOC" },
];

export type IntegrationFlags = {
  anthropic: boolean;
  google: boolean;
  sheets: boolean;
  slackAr: boolean;
  slackDispatch: boolean;
  limoAnywhereSignature: boolean;
};

const statusDot = (ready: boolean) => (ready ? "bg-good" : "bg-gold-soft");

export function SidebarNav({ integrations }: { integrations: IntegrationFlags }) {
  const pathname = usePathname();
  const readiness = [
    integrations.anthropic,
    integrations.google,
    integrations.sheets,
    integrations.slackAr,
    integrations.slackDispatch,
  ].filter(Boolean).length;

  const isActive = (href: string): boolean =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="flex w-full flex-col border-b border-hairline bg-[#0a0b0e]/80 px-5 py-5 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:w-[268px] lg:shrink-0 lg:border-b-0 lg:border-r lg:px-6 lg:py-8">
      <Link href="/" className="group flex items-start gap-3">
        <span className="mt-0.5 grid h-10 w-10 place-items-center border border-gold-soft/60 bg-gold/10">
          <span className="display text-[15px] tracking-[0.08em] text-gold">PSS</span>
        </span>
        <span>
          <span className="display block text-[15px] leading-tight text-ivory">Personal Sedan</span>
          <span className="eyebrow block pt-1">Las Vegas · Est. 2000</span>
        </span>
      </Link>

      <div className="gold-rule mt-5" />

      <nav className="mt-5 grid grid-cols-2 gap-1 sm:grid-cols-4 lg:flex lg:flex-col">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="nav-link" data-active={isActive(link.href)}>
            <span>{link.label}</span>
            <span className="mono text-[9px] tracking-[0.12em] text-gold-soft">{link.note}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-auto hidden pt-8 lg:block">
        <div className="panel-flat p-3.5">
          <p className="eyebrow">Integration transport</p>
          <p className="mt-2 text-[12px] text-ivory">
            {readiness} of 5 live channels
          </p>
          <ul className="mt-3 space-y-2 text-[11.5px] text-muted">
            {[
              { label: "Anthropic Claude", ready: integrations.anthropic },
              { label: "Gmail drafts", ready: integrations.google },
              { label: "Google Sheets", ready: integrations.sheets },
              { label: "Slack #ar-alerts", ready: integrations.slackAr },
              { label: "Slack #dispatch-log", ready: integrations.slackDispatch },
            ].map((item) => (
              <li key={item.label} className="flex items-center justify-between gap-2">
                <span>{item.label}</span>
                <span className={`h-1.5 w-1.5 rounded-full ${statusDot(item.ready)}`} />
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-hairline pt-2.5">
            <p className="mono text-[9.5px] leading-relaxed text-gold-soft">
              {integrations.limoAnywhereSignature ? "HMAC SIGNATURES ENFORCED" : "HMAC KEY NOT SET · DEV MODE"}
            </p>
          </div>
        </div>
        <p className="mono mt-4 text-[9.5px] leading-relaxed text-[#5d636c]">
          DRAFTS ONLY · NO AUTOMATED SENDS
          <br />
          Node.js · Next.js App Router · Postgres
        </p>
      </div>
    </aside>
  );
}

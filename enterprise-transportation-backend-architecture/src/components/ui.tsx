import type { ReactNode } from "react";

const GOOD = new Set([
  "processed",
  "succeeded",
  "live",
  "verified",
  "escalated",
  "quote_drafted",
  "sent",
  "ok",
]);
const WARN = new Set(["received", "running", "tracked", "unverified", "pending", "monitor", "ar-monitor"]);
const BAD = new Set(["failed", "invalid", "error", "critical"]);

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const key = status.toLowerCase();
  const tone = BAD.has(key)
    ? "border-bad/40 bg-bad/10 text-bad"
    : GOOD.has(key)
      ? "border-good/40 bg-good/10 text-good"
      : WARN.has(key)
        ? "border-warn/40 bg-warn/10 text-warn"
        : "border-hairline bg-white/[0.03] text-muted";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] text-[9.5px] font-semibold uppercase tracking-[0.12em] ${tone}`}
    >
      <span className="h-1 w-1 rounded-full bg-current" />
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}

export function Badge({ children, tone = "gold" }: { children: ReactNode; tone?: "gold" | "slate" }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-[2px] text-[9px] font-semibold uppercase tracking-[0.13em] ${
        tone === "gold"
          ? "border-gold-soft/50 bg-gold/10 text-gold"
          : "border-hairline bg-white/[0.03] text-muted"
      }`}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="fade-in">
      <p className="eyebrow">{eyebrow}</p>
      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.08] text-ivory">{title}</h1>
          <p className="mt-2.5 max-w-3xl text-[13px] leading-relaxed text-muted">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="gold-rule mt-5" />
    </header>
  );
}

export function Panel({
  title,
  eyebrow,
  action,
  children,
  className = "",
  bodyClassName = "p-4 sm:p-5",
}: {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title || action ? (
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 sm:px-5">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            {title ? <h2 className="display text-[15px] text-ivory">{title}</h2> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Metric({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="panel-flat p-3.5">
      <p className="eyebrow text-[9px]">{label}</p>
      <p className={`stat-value mt-2 ${accent ? "text-gold" : "text-ivory"}`}>{value}</p>
      {hint ? <p className="mono mt-1.5 text-[10px] leading-relaxed text-[#71777f]">{hint}</p> : null}
    </div>
  );
}

export function Field({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 border-b border-[#1b1e23] py-2 last:border-b-0">
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#71777f]">{label}</span>
      <span className={`text-[12.5px] leading-relaxed text-ivory ${mono ? "mono text-[11.5px]" : ""}`}>{value}</span>
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-sm border border-dashed border-hairline px-4 py-8 text-center">
      <p className="display text-[15px] text-ivory">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

export const formatDateTime = (value: Date | string | null | undefined): string => {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

export const formatWindow = (value: Date | string | null | undefined): string => {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

export const formatFullDateTime = (value: Date | string | null | undefined): string => {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
};

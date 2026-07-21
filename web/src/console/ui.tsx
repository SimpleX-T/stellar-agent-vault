// Shared instrument-panel primitives for the Vault Terminal console.
import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "../lib/utils";

/** Mono, spaced, uppercase micro-label. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("eyebrow", className)}>{children}</span>;
}

/** The SpendVault brand mark — descending ledger bars (a budget drawn down).
 * Matches public/favicon.svg exactly; renders in currentColor so it takes on
 * whatever gilt the surrounding text carries. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="currentColor" aria-hidden="true">
      <rect x="17" y="17.5" width="30" height="6.5" rx="3.25" />
      <rect x="17" y="29" width="21" height="6.5" rx="3.25" />
      <rect x="17" y="40.5" width="12" height="6.5" rx="3.25" />
    </svg>
  );
}

/** The core graphite surface. */
export function Panel({
  className,
  hover,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return <div className={cn("panel", hover && "panel-hover", className)} {...props} />;
}

type Tone = "flow" | "stop" | "muted" | "warning" | "info";
const toneStyles: Record<Tone, string> = {
  flow: "text-primary bg-primary/10 border-primary/25",
  stop: "text-coral bg-coral/10 border-coral/25",
  warning: "text-warning bg-warning/10 border-warning/20",
  info: "text-info bg-info/10 border-info/20",
  muted: "text-muted-foreground bg-foreground/[0.04] border-border",
};

/** Semantic status pill. `flow` = within policy/approved; `stop` = blocked. */
export function Pill({
  tone = "muted",
  dot,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        toneStyles[tone],
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full bg-current", tone === "flow" && "pulse-dot")} />}
      {children}
    </span>
  );
}

/** Copyable mono value with a hover affordance. */
export function Copyable({
  value,
  display,
  className,
}: {
  value: string;
  display?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      title={value}
      className={cn(
        "group inline-flex items-center gap-1.5 data text-[12.5px] text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      {display ?? value}
      {copied ? (
        <Check className="size-3.5 text-primary" />
      ) : (
        <Copy className="size-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
      )}
    </button>
  );
}

/** Signature: a letterpress verdict stamp — the product's core drama, inked. */
export function Stamp({
  verdict,
  label,
  size,
  className,
}: {
  verdict: "approved" | "denied";
  label?: string;
  size?: "lg";
  className?: string;
}) {
  return (
    <span className={cn("stamp", verdict === "approved" ? "stamp-approved" : "stamp-denied", size === "lg" && "stamp-lg", className)}>
      {label ?? (verdict === "approved" ? "Approved" : "Denied")}
    </span>
  );
}

/** Signature: the carved budget meter with a redline at the hard cap. */
export function Meter({ spent, cap, className }: { spent: bigint; cap: bigint; className?: string }) {
  const has = cap > 0n;
  const pct = has ? Number((spent * 10000n) / cap) / 100 : 0;
  const over = pct >= 100;
  return (
    <div className={cn("meter", className)}>
      <div className={cn("meter-fill", over && "over")} style={{ width: `${Math.min(Math.max(pct, 1.5), 100)}%` }} />
      {has && <div className="meter-redline" style={{ left: "calc(100% - 1px)" }} />}
    </div>
  );
}

/** A labelled metric. Big tabular value, mono eyebrow, optional sub/emphasis. */
export function StatTile({
  label,
  value,
  unit,
  sub,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  tone?: "flow" | "stop";
  className?: string;
}) {
  return (
    <Panel className={cn("p-4", className)}>
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className={cn(
            "data text-[26px] font-semibold leading-none tracking-tight",
            tone === "flow" && "text-primary",
            tone === "stop" && "text-coral",
          )}
        >
          {value}
        </span>
        {unit && <span className="data text-[13px] text-muted-foreground">{unit}</span>}
      </div>
      {sub && <div className="mt-2 text-[12px] text-muted-foreground">{sub}</div>}
    </Panel>
  );
}

/** Page title block with a mono eyebrow. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex items-end justify-between gap-4">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-1.5 font-display text-[27px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** A field label + control wrapper. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between">
        <span className="text-[12.5px] font-medium text-foreground">{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border", className)} />;
}

/** Empty-state block. */
export function Empty({ icon, title, sub }: { icon?: ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed border-border px-6 py-14 text-center">
      {icon && <div className="text-muted-foreground/60">{icon}</div>}
      <div className="text-[14px] font-medium">{title}</div>
      {sub && <div className="max-w-sm text-[12.5px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

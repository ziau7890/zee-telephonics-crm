import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, back, actions }: { title: string; description?: string; back?: { href: string; label: string }; actions?: ReactNode }) {
  return (
    <header className="mb-8 space-y-3">
      {back ? (
        <Link href={back.href} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-navy dark:text-white">{title}</h1>
          {description ? <p className="mt-1 text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function Panel({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("crm-glass rounded-[1.75rem] p-6 shadow-soft", className)}>
      {title ? <h2 className="mb-4 font-display text-lg font-bold">{title}</h2> : null}
      {children}
    </section>
  );
}

const TONES = {
  neutral: "bg-surface-muted text-foreground",
  cyan: "bg-brand-cyan/15 text-accent-text",
  green: "bg-success-surface text-success",
  amber: "bg-warning-surface text-warning",
  navy: "bg-navy/10 text-navy dark:bg-white/10 dark:text-white",
  red: "bg-danger-surface text-danger",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", TONES[tone])}>{children}</span>;
}

export const STATUS_TONES: Record<string, Tone> = {
  active: "green",
  invited: "amber",
  deactivated: "red",
  open: "cyan",
  done: "green",
  cancelled: "neutral",
  overdue: "red",
  today: "amber",
  upcoming: "cyan",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "neutral"}>{status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")}</Badge>;
}

export function DataTable({ head, children, empty }: { head: string[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="crm-glass overflow-x-auto rounded-[1.75rem] shadow-soft">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border/70 text-xs tracking-wide text-muted uppercase">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-muted">{children}</p>;
}

export function Tabs({ items, active }: { items: { href: string; label: string }[]; active: string }) {
  return (
    <nav aria-label="Section" className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
            t.href === active ? "border-brand-cyan-700 text-foreground dark:border-brand-cyan" : "border-transparent text-muted hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 break-words">{children || <span className="text-muted">Not given</span>}</dd>
    </div>
  );
}

export function Notice({ tone = "success", children }: { tone?: "success" | "error"; children: ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={cn("mb-6 rounded-2xl border px-4 py-3 text-sm", tone === "error" ? "border-danger/30 bg-danger-surface text-danger" : "border-success/30 bg-success-surface")}>
      {children}
    </p>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <form className="mb-4 flex flex-wrap items-end gap-3" role="search">
      {children}
    </form>
  );
}

export function FilterLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      {children}
    </label>
  );
}

/** A destructive action behind a second click: the first opens, the second confirms. */
export function DangerZone({ label, confirmLabel, note, action, fields }: { label: string; confirmLabel: string; note: string; action: (formData: FormData) => void | Promise<void>; fields: Record<string, string> }) {
  return (
    <details className="group rounded-2xl border border-danger/25 px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-danger marker:content-none">{label}</summary>
      <form action={action} className="mt-3 space-y-3">
        {Object.entries(fields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <p className="text-xs text-muted">{note}</p>
        <button type="submit" className="inline-flex h-9 items-center rounded-full bg-danger px-4 text-sm font-semibold text-white">
          {confirmLabel}
        </button>
      </form>
    </details>
  );
}

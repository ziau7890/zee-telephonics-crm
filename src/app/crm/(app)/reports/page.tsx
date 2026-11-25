import Link from "next/link";
import { Download } from "lucide-react";
import { FilterLabel, Notice, PageHeader, Panel } from "@/components/crm/ui";
import { Input } from "@/components/ui/form";
import { Button, buttonClasses } from "@/components/ui/button";
import { requirePagePermission } from "@/lib/auth/session";
import { can, permissionScope } from "@/lib/auth/permissions";
import { getServices, getStaffOptions, serviceTitle } from "@/lib/crm/server";
import { CALL_OUTCOME_LABELS, LEAD_STATUS_LABELS, SOURCE_LABELS, type CallOutcome, type Source } from "@/lib/crm/leads";
import { RANGE_PRESETS, buildReport, resolveRange } from "@/lib/crm/reports";
import { cn } from "@/lib/utils";
import { loadReportData } from "./data";

export const metadata = { title: "Reports" };

function Stat({ value, label, hint }: { value: string | number; label: string; hint?: string }) {
  return (
    <div className="crm-glass rounded-[1.5rem] p-5 shadow-soft">
      <p className="font-display text-3xl font-bold tabular-nums">{value}</p>
      <p className="text-sm font-medium">{label}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function Bars({ rows, empty }: { rows: { label: string; count: number }[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-3 text-sm">
          <span className="truncate" title={r.label}>
            {r.label}
          </span>
          <span className="h-2.5 rounded-full bg-surface-muted">
            <span className="block h-full rounded-full bg-gradient-to-r from-brand-blue to-brand-cyan" style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className="text-right font-medium tabular-nums">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const user = await requirePagePermission("reports", "view");
  const range = resolveRange(params);
  const [data, services, people] = await Promise.all([loadReportData(range), getServices(), getStaffOptions()]);
  const report = buildReport(data.leads, data.calls, data.followUps, range);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const leadScope = permissionScope(user.grants, "leads", "view");
  const exportHref = `/crm/reports/export?${new URLSearchParams(range.key === "custom" ? { from: params.from!, to: params.to! } : { range: range.key }).toString()}`;
  const maxTrend = Math.max(1, ...report.trend.map((t) => t.count));

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${range.label}. ${leadScope === "all" ? "All leads." : leadScope === "team" ? "Your team's leads." : "Your leads."} Figures come only from records in the CRM.`}
        actions={
          can(user.grants, "reports", "export") ? (
            <a href={exportHref} className={buttonClasses("outline")}>
              <Download className="size-4" aria-hidden /> Download leads (CSV)
            </a>
          ) : null
        }
      />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <nav aria-label="Period" className="flex flex-wrap gap-1 rounded-full border border-border bg-surface p-1 text-sm">
          {Object.keys(RANGE_PRESETS).map((k) => (
            <Link
              key={k}
              href={`/crm/reports?range=${k}`}
              aria-current={k === range.key ? "page" : undefined}
              className={cn("rounded-full px-3 py-1.5 font-medium", k === range.key ? "bg-navy text-white dark:bg-brand-cyan dark:text-navy" : "text-muted hover:text-foreground")}
            >
              {k === "365" ? "12 months" : `${k} days`}
            </Link>
          ))}
        </nav>
        <form className="flex flex-wrap items-end gap-2">
          <FilterLabel label="From">
            <Input type="date" name="from" defaultValue={params.from ?? ""} required className="w-auto" />
          </FilterLabel>
          <FilterLabel label="To">
            <Input type="date" name="to" defaultValue={params.to ?? ""} required className="w-auto" />
          </FilterLabel>
          <Button type="submit" variant="outline">
            Apply
          </Button>
        </form>
      </div>
      {data.failed ? <Notice tone="error">Some figures could not be loaded. Reload the page to try again.</Notice> : null}
      {data.truncated ? <Notice tone="error">This period has more than 10,000 records, so the figures are incomplete. Choose a shorter period.</Notice> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat value={report.newLeads} label="New leads" />
        <Stat value={report.won} label="Won" />
        <Stat value={report.lost} label="Lost" />
        <Stat value={report.winRate === null ? "None closed" : `${Math.round(report.winRate * 100)}%`} label="Win rate" hint="Won out of leads closed in the period" />
        <Stat value={report.calls} label="Calls logged" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="New leads over time" className="lg:col-span-2">
          {report.newLeads ? (
            <div className="flex h-40 items-end gap-1" role="img" aria-label={`New leads per ${report.trend.length > 31 ? "week" : "day"}`}>
              {report.trend.map((t) => (
                <div key={t.label} className="group relative flex h-full flex-1 flex-col justify-end" title={`${t.label}: ${t.count}`}>
                  <div className="rounded-t-md bg-gradient-to-t from-brand-blue to-brand-cyan" style={{ height: `${(t.count / maxTrend) * 100}%`, minHeight: t.count ? 4 : 0 }} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No new leads in this period.</p>
          )}
          {report.trend.length ? (
            <p className="mt-2 flex justify-between text-xs text-muted">
              <span>{report.trend[0].label}</span>
              <span>{report.trend[report.trend.length - 1].label}</span>
            </p>
          ) : null}
        </Panel>
        <Panel title="Where new leads came from">
          <Bars rows={report.bySource.map((r) => ({ label: SOURCE_LABELS[r.key as Source] ?? r.key, count: r.count }))} empty="No new leads in this period." />
        </Panel>
        <Panel title="Services asked about">
          <Bars rows={report.byService.map((r) => ({ label: serviceTitle(services, r.key) ?? "Not given", count: r.count }))} empty="No new leads in this period." />
        </Panel>
        <Panel title="Where this period's new leads are now">
          <Bars rows={report.byStatus.map((r) => ({ label: LEAD_STATUS_LABELS[r.key], count: r.count }))} empty="No new leads in this period." />
        </Panel>
        <Panel title="Call outcomes">
          <Bars rows={report.callOutcomes.map((r) => ({ label: CALL_OUTCOME_LABELS[r.key as CallOutcome] ?? "Not recorded", count: r.count }))} empty="No calls logged in this period." />
        </Panel>
        <Panel title="Follow-up discipline" className="lg:col-span-2">
          <dl className="grid gap-4 sm:grid-cols-4">
            {[
              ["Done on time", report.followUps.doneOnTime],
              ["Done late", report.followUps.doneLate],
              ["Open now", report.followUps.open],
              ["Overdue now", report.followUps.openOverdue],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="font-display text-2xl font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      <h2 className="mt-10 mb-4 font-display text-xl font-bold">By person</h2>
      <div className="crm-glass overflow-x-auto rounded-[1.75rem] shadow-soft">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border/70 text-xs tracking-wide text-muted uppercase">
            <tr>
              {["Person", "New leads", "Won", "Lost", "Calls", "Follow-ups done", "Overdue now"].map((h) => (
                <th key={h} scope="col" className="px-4 py-3 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {report.owners.map((o) => (
              <tr key={o.ownerId ?? "none"}>
                <td className="px-4 py-3 font-medium">{o.ownerId ? (names.get(o.ownerId) ?? "Former staff member") : "Unassigned"}</td>
                <td className="px-4 py-3 tabular-nums">{o.newLeads}</td>
                <td className="px-4 py-3 tabular-nums">{o.won}</td>
                <td className="px-4 py-3 tabular-nums">{o.lost}</td>
                <td className="px-4 py-3 tabular-nums">{o.calls}</td>
                <td className="px-4 py-3 tabular-nums">{o.followUpsDone}</td>
                <td className={cn("px-4 py-3 tabular-nums", o.overdue ? "font-semibold text-danger" : "")}>{o.overdue}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!report.owners.length ? <p className="px-4 py-8 text-center text-sm text-muted">No activity in this period.</p> : null}
      </div>
    </>
  );
}

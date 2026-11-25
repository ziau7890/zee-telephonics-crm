/**
 * Report calculations. Pure functions over rows the viewer is allowed to see
 * (row-level security has already filtered them), so they are easy to test.
 */
import type { LeadStatus } from "./leads";

export interface ReportLead {
  id: string;
  status: LeadStatus;
  source: string;
  service_interest: string | null;
  owner_id: string | null;
  created_at: string;
  won_at: string | null;
  closed_at: string | null;
}

export interface ReportCall {
  author_id: string | null;
  call_outcome: string | null;
  created_at: string;
}

export interface ReportFollowUp {
  assigned_to: string | null;
  status: "open" | "done" | "cancelled";
  due_at: string;
  completed_at: string | null;
}

export interface Range {
  from: string; // inclusive ISO
  to: string; // exclusive ISO
}

const inRange = (iso: string | null, r: Range) => Boolean(iso && iso >= r.from && iso < r.to);

export interface OwnerRow {
  ownerId: string | null;
  newLeads: number;
  won: number;
  lost: number;
  calls: number;
  followUpsDone: number;
  overdue: number;
}

export interface Report {
  newLeads: number;
  won: number;
  lost: number;
  /** Won as a share of leads closed in the period, 0 to 1, or null when none closed. */
  winRate: number | null;
  calls: number;
  bySource: { key: string; count: number }[];
  byService: { key: string | null; count: number }[];
  byStatus: { key: LeadStatus; count: number }[];
  callOutcomes: { key: string; count: number }[];
  followUps: { doneOnTime: number; doneLate: number; openOverdue: number; open: number };
  owners: OwnerRow[];
  trend: { label: string; count: number }[];
}

function tally<T extends string | null>(values: T[]) {
  const m = new Map<T, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
}

/** Buckets for the new-leads trend: days for ranges up to 31 days, otherwise weeks starting Monday (UTC). */
export function trendBuckets(r: Range): { start: string; label: string }[] {
  const from = new Date(r.from);
  const to = new Date(r.to);
  const days = Math.ceil((to.getTime() - from.getTime()) / 864e5);
  const out: { start: string; label: string }[] = [];
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  if (days <= 31) {
    for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())); d < to; d = new Date(d.getTime() + 864e5)) {
      out.push({ start: d.toISOString(), label: fmt.format(d) });
    }
  } else {
    const first = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
    for (let d = first; d < to; d = new Date(d.getTime() + 7 * 864e5)) {
      out.push({ start: d.toISOString(), label: `w/c ${fmt.format(d)}` });
    }
  }
  return out;
}

export function buildReport(leads: ReportLead[], calls: ReportCall[], followUps: ReportFollowUp[], r: Range, now = new Date()): Report {
  const created = leads.filter((l) => inRange(l.created_at, r));
  const won = leads.filter((l) => l.status === "won" && inRange(l.won_at, r));
  const lost = leads.filter((l) => l.status === "lost" && inRange(l.closed_at, r));
  const periodCalls = calls.filter((c) => inRange(c.created_at, r));
  const nowIso = now.toISOString();

  const fuDone = followUps.filter((f) => f.status === "done" && inRange(f.completed_at, r));
  const doneOnTime = fuDone.filter((f) => f.completed_at! <= f.due_at).length;
  const open = followUps.filter((f) => f.status === "open");
  const openOverdue = open.filter((f) => f.due_at < nowIso).length;

  const ownerIds = new Set<string | null>([...created.map((l) => l.owner_id), ...won.map((l) => l.owner_id), ...lost.map((l) => l.owner_id), ...periodCalls.map((c) => c.author_id), ...fuDone.map((f) => f.assigned_to), ...open.filter((f) => f.due_at < nowIso).map((f) => f.assigned_to)]);
  const owners: OwnerRow[] = [...ownerIds]
    .map((ownerId) => ({
      ownerId,
      newLeads: created.filter((l) => l.owner_id === ownerId).length,
      won: won.filter((l) => l.owner_id === ownerId).length,
      lost: lost.filter((l) => l.owner_id === ownerId).length,
      calls: periodCalls.filter((c) => c.author_id === ownerId).length,
      followUpsDone: fuDone.filter((f) => f.assigned_to === ownerId).length,
      overdue: open.filter((f) => f.assigned_to === ownerId && f.due_at < nowIso).length,
    }))
    .sort((a, b) => b.won - a.won || b.newLeads - a.newLeads || b.calls - a.calls);

  const buckets = trendBuckets(r);
  const trend = buckets.map((b, i) => {
    const end = buckets[i + 1]?.start ?? r.to;
    return { label: b.label, count: created.filter((l) => l.created_at >= b.start && l.created_at < end).length };
  });

  const closed = won.length + lost.length;
  return {
    newLeads: created.length,
    won: won.length,
    lost: lost.length,
    winRate: closed ? won.length / closed : null,
    calls: periodCalls.length,
    bySource: tally(created.map((l) => l.source)),
    byService: tally(created.map((l) => l.service_interest)),
    byStatus: tally(created.map((l) => l.status)) as { key: LeadStatus; count: number }[],
    callOutcomes: tally(periodCalls.map((c) => c.call_outcome ?? "not_recorded")),
    followUps: { doneOnTime, doneLate: fuDone.length - doneOnTime, openOverdue, open: open.length },
    owners,
    trend,
  };
}

/** Spreadsheet-safe CSV: quotes every cell and neutralises formulas (=, +, -, @). */
export function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          let v = cell === null || cell === undefined ? "" : String(cell);
          if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
          return `"${v.replace(/"/g, '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
}

export const RANGE_PRESETS = { "7": 7, "30": 30, "90": 90, "365": 365 } as const;

/** Resolves ?range= or ?from=&to= (YYYY-MM-DD, inclusive) into a UTC range. */
export function resolveRange(params: { range?: string; from?: string; to?: string }, now = new Date()): Range & { label: string; key: string } {
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (params.from && params.to && date.test(params.from) && date.test(params.to) && params.from <= params.to) {
    const to = new Date(`${params.to}T00:00:00Z`);
    to.setUTCDate(to.getUTCDate() + 1);
    return { from: `${params.from}T00:00:00.000Z`, to: to.toISOString(), label: `${params.from} to ${params.to}`, key: "custom" };
  }
  const key = params.range && params.range in RANGE_PRESETS ? params.range : "30";
  const days = RANGE_PRESETS[key as keyof typeof RANGE_PRESETS];
  return { from: new Date(now.getTime() - days * 864e5).toISOString(), to: new Date(now.getTime() + 1000).toISOString(), label: `Last ${days} days`, key };
}

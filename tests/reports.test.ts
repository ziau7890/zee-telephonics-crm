import { describe, expect, it } from "vitest";
import { buildReport, resolveRange, toCsv, trendBuckets, type ReportLead } from "@/lib/crm/reports";

const range = { from: "2026-11-01T00:00:00.000Z", to: "2026-11-08T00:00:00.000Z" };
const lead = (p: Partial<ReportLead>): ReportLead => ({
  id: Math.random().toString(),
  status: "new",
  source: "website",
  service_interest: null,
  owner_id: "a",
  created_at: "2026-11-02T10:00:00.000Z",
  won_at: null,
  closed_at: null,
  ...p,
});

describe("buildReport", () => {
  const leads = [
    lead({ owner_id: "a", source: "website", service_interest: "outbound-calling" }),
    lead({ owner_id: "a", status: "won", won_at: "2026-11-05T00:00:00.000Z", closed_at: "2026-11-05T00:00:00.000Z" }),
    lead({ owner_id: "b", status: "lost", closed_at: "2026-11-06T00:00:00.000Z", source: "phone" }),
    // created before the period, won inside it
    lead({ owner_id: "b", status: "won", created_at: "2026-10-01T00:00:00.000Z", won_at: "2026-11-03T00:00:00.000Z", closed_at: "2026-11-03T00:00:00.000Z" }),
    // outside entirely
    lead({ created_at: "2026-10-01T00:00:00.000Z" }),
  ];
  const calls = [
    { author_id: "a", call_outcome: "interested", created_at: "2026-11-02T11:00:00.000Z" },
    { author_id: "a", call_outcome: "no_answer", created_at: "2026-11-02T12:00:00.000Z" },
    { author_id: "b", call_outcome: "no_answer", created_at: "2026-10-30T12:00:00.000Z" },
  ];
  const followUps = [
    { assigned_to: "a", status: "done" as const, due_at: "2026-11-03T10:00:00.000Z", completed_at: "2026-11-03T09:00:00.000Z" },
    { assigned_to: "b", status: "done" as const, due_at: "2026-11-03T10:00:00.000Z", completed_at: "2026-11-04T09:00:00.000Z" },
    { assigned_to: "b", status: "open" as const, due_at: "2026-11-06T10:00:00.000Z", completed_at: null },
    { assigned_to: "a", status: "open" as const, due_at: "2026-11-20T10:00:00.000Z", completed_at: null },
  ];
  const r = buildReport(leads, calls, followUps, range, new Date("2026-11-07T00:00:00.000Z"));

  it("counts only what happened in the period", () => {
    expect(r.newLeads).toBe(3);
    expect(r.won).toBe(2);
    expect(r.lost).toBe(1);
    expect(r.winRate).toBeCloseTo(2 / 3);
    expect(r.calls).toBe(2);
  });
  it("breaks down sources, services and call outcomes", () => {
    expect(r.bySource).toEqual([
      { key: "website", count: 2 },
      { key: "phone", count: 1 },
    ]);
    expect(r.byService.find((s) => s.key === "outbound-calling")?.count).toBe(1);
    expect(r.callOutcomes).toEqual([
      { key: "interested", count: 1 },
      { key: "no_answer", count: 1 },
    ]);
  });
  it("measures follow-up discipline", () => {
    expect(r.followUps).toEqual({ doneOnTime: 1, doneLate: 1, openOverdue: 1, open: 2 });
  });
  it("summarises per person", () => {
    const a = r.owners.find((o) => o.ownerId === "a")!;
    const b = r.owners.find((o) => o.ownerId === "b")!;
    expect(a).toMatchObject({ newLeads: 2, won: 1, lost: 0, calls: 2, followUpsDone: 1, overdue: 0 });
    expect(b).toMatchObject({ newLeads: 1, won: 1, lost: 1, calls: 0, followUpsDone: 1, overdue: 1 });
  });
  it("has no win rate when nothing closed", () => {
    expect(buildReport([], [], [], range).winRate).toBeNull();
  });
  it("buckets the trend by day for short ranges", () => {
    expect(r.trend).toHaveLength(7);
    expect(r.trend.reduce((n, t) => n + t.count, 0)).toBe(3);
  });
});

describe("ranges and buckets", () => {
  it("uses weeks for long ranges", () => {
    const b = trendBuckets({ from: "2026-01-01T00:00:00.000Z", to: "2026-04-01T00:00:00.000Z" });
    expect(b[0].label.startsWith("w/c")).toBe(true);
    expect(b.length).toBeGreaterThanOrEqual(13);
  });
  it("resolves presets and inclusive custom dates", () => {
    const now = new Date("2026-11-24T12:00:00.000Z");
    expect(resolveRange({ range: "7" }, now).from).toBe("2026-11-17T12:00:00.000Z");
    expect(resolveRange({ range: "bogus" }, now).key).toBe("30");
    const c = resolveRange({ from: "2026-11-01", to: "2026-11-30" }, now);
    expect([c.from, c.to]).toEqual(["2026-11-01T00:00:00.000Z", "2026-12-01T00:00:00.000Z"]);
    expect(resolveRange({ from: "2026-12-01", to: "2026-11-01" }, now).key).toBe("30");
  });
});

describe("CSV export", () => {
  it("quotes cells and neutralises spreadsheet formulas", () => {
    expect(toCsv([["a", 'say "hi"', null], ["=HYPERLINK(1)", "+1 555", "-2"]])).toBe(`"a","say ""hi""",""\r\n"'=HYPERLINK(1)","'+1 555","'-2"`);
  });
});

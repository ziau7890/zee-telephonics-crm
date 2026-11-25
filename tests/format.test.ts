import { describe, expect, it } from "vitest";
import { localInputToUtc, utcToLocalInput } from "@/lib/format";
import { dayKey, defaultDueInput, followUpState, formatDuration, phoneDigits, searchTerm } from "@/lib/crm/leads";

describe("time zones", () => {
  it("converts Pakistan local time to UTC", () => {
    expect(localInputToUtc("2026-11-20T09:00", "Asia/Karachi")).toBe("2026-11-20T04:00:00.000Z");
  });
  it("handles US daylight saving", () => {
    expect(localInputToUtc("2026-07-01T09:00", "America/New_York")).toBe("2026-07-01T13:00:00.000Z");
    expect(localInputToUtc("2026-12-01T09:00", "America/New_York")).toBe("2026-12-01T14:00:00.000Z");
  });
  it("round-trips for inputs", () => {
    expect(utcToLocalInput("2026-11-20T04:00:00.000Z", "Asia/Karachi")).toBe("2026-11-20T09:00");
  });
  it("rejects malformed input", () => {
    expect(localInputToUtc("tomorrow", "UTC")).toBeNull();
  });
  it("gives the calendar day in the viewer's zone", () => {
    expect(dayKey(new Date("2026-11-24T20:00:00Z"), "Asia/Karachi")).toBe("2026-11-25");
    expect(dayKey(new Date("2026-11-24T20:00:00Z"), "America/New_York")).toBe("2026-11-24");
  });
  it("suggests tomorrow 10:00 for a new follow-up", () => {
    expect(defaultDueInput(new Date("2026-11-24T20:00:00Z"), "Asia/Karachi")).toBe("2026-11-26T10:00");
    expect(defaultDueInput(new Date("2026-11-24T20:00:00Z"), "UTC")).toBe("2026-11-25T10:00");
  });
});

describe("follow-up state", () => {
  const now = new Date("2026-11-24T10:00:00Z");
  it("marks past open follow-ups overdue", () => {
    expect(followUpState("2026-11-24T09:00:00Z", "open", now, "UTC")).toBe("overdue");
  });
  it("marks later today as today, in the viewer's zone", () => {
    expect(followUpState("2026-11-24T22:00:00Z", "open", now, "UTC")).toBe("today");
    // 22:00 UTC is already tomorrow in Karachi
    expect(followUpState("2026-11-24T22:00:00Z", "open", now, "Asia/Karachi")).toBe("upcoming");
  });
  it("keeps closed states", () => {
    expect(followUpState("2026-11-20T09:00:00Z", "done", now, "UTC")).toBe("done");
    expect(followUpState("2026-11-20T09:00:00Z", "cancelled", now, "UTC")).toBe("cancelled");
  });
});

describe("small helpers", () => {
  it("builds dialable digits only from real numbers", () => {
    expect(phoneDigits("+92 (300) 123-4567")).toBe("923001234567");
    expect(phoneDigits("12")).toBe("");
    expect(phoneDigits(null)).toBe("");
  });
  it("strips characters that would break a search filter", () => {
    expect(searchTerm("acme),status.eq.won")).toBe("acme status.eq.won");
    expect(searchTerm("  a%b*c  ")).toBe("a b c");
    expect(searchTerm("x".repeat(200)).length).toBe(80);
  });
  it("formats call length", () => {
    expect(formatDuration(270)).toBe("4 min 30 s");
    expect(formatDuration(120)).toBe("2 min");
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(null)).toBeNull();
  });
});

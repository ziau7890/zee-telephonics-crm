import { describe, expect, it } from "vitest";
import { activitySchema, contactSchema, followUpSchema, leadSchema, leadUpdateSchema, newPasswordSchema, otpSchema, safeNextPath } from "@/lib/validation";

describe("lead form", () => {
  it("accepts a phone-only lead and turns blanks into null", () => {
    const r = leadSchema.safeParse({ full_name: " Ali Khan ", email: "", phone: "+92 300 1234567", company: "", service_interest: "outbound-calling", message: "", source: "phone" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.full_name).toBe("Ali Khan");
      expect(r.data.email).toBeNull();
      expect(r.data.company).toBeNull();
      expect(r.data.status).toBe("new");
      expect(r.data.owner_id).toBeNull();
    }
  });
  it("needs an email or a phone", () => {
    const r = leadSchema.safeParse({ full_name: "Ali Khan" });
    expect(r.success).toBe(false);
  });
  it("normalises email and rejects bad ones", () => {
    const ok = leadSchema.safeParse({ full_name: "Jane Doe", email: "JANE@Example.com " });
    expect(ok.success && ok.data.email).toBe("jane@example.com");
    expect(leadSchema.safeParse({ full_name: "Jane Doe", email: "jane@" }).success).toBe(false);
  });
  it("rejects unknown statuses, sources and malformed owners", () => {
    expect(leadSchema.safeParse({ full_name: "Jane", email: "j@x.io", status: "hot" }).success).toBe(false);
    expect(leadSchema.safeParse({ full_name: "Jane", email: "j@x.io", source: "tiktok" }).success).toBe(false);
    expect(leadSchema.safeParse({ full_name: "Jane", email: "j@x.io", owner_id: "admin" }).success).toBe(false);
  });
  it("status panel accepts an empty owner as unassigned", () => {
    const r = leadUpdateSchema.safeParse({ status: "lost", priority: "high", owner_id: "", lost_reason: "Chose another vendor" });
    expect(r.success && r.data.owner_id).toBeNull();
  });
});

describe("activity form", () => {
  it("requires an outcome for calls and converts minutes", () => {
    expect(activitySchema.safeParse({ kind: "call", body: "", call_outcome: "", call_minutes: "" }).success).toBe(false);
    const r = activitySchema.safeParse({ kind: "call", body: "", call_outcome: "no_answer", call_minutes: "1.5" });
    expect(r.success && r.data.call_minutes).toBe(1.5);
  });
  it("requires text for notes", () => {
    expect(activitySchema.safeParse({ kind: "note", body: "" }).success).toBe(false);
    expect(activitySchema.safeParse({ kind: "note", body: "Asked for pricing" }).success).toBe(true);
  });
  it("rejects invented outcomes", () => {
    expect(activitySchema.safeParse({ kind: "call", call_outcome: "sold_everything" }).success).toBe(false);
  });
});

describe("follow-up and contact forms", () => {
  it("needs a title and a datetime-local value", () => {
    expect(followUpSchema.safeParse({ title: "Call back", kind: "call", due_at: "2026-11-25T10:00" }).success).toBe(true);
    expect(followUpSchema.safeParse({ title: "Call back", kind: "call", due_at: "tomorrow" }).success).toBe(false);
    expect(followUpSchema.safeParse({ title: "", kind: "call", due_at: "2026-11-25T10:00" }).success).toBe(false);
  });
  it("accepts a minimal contact", () => {
    const r = contactSchema.safeParse({ full_name: "Sara Ahmed" });
    expect(r.success && r.data.source).toBe("manual");
  });
});

describe("auth validation", () => {
  it("enforces password strength and matching", () => {
    expect(newPasswordSchema.safeParse({ password: "short", confirm: "short" }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ password: "LongEnough123", confirm: "LongEnough124" }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ password: "LongEnough123", confirm: "LongEnough123" }).success).toBe(true);
  });
  it("accepts only 6-digit codes", () => {
    expect(otpSchema.safeParse({ email: "a@b.co", code: "123456" }).success).toBe(true);
    expect(otpSchema.safeParse({ email: "a@b.co", code: "12345a" }).success).toBe(false);
  });
  it("only redirects inside the CRM", () => {
    expect(safeNextPath("/crm/leads")).toBe("/crm/leads");
    expect(safeNextPath("https://evil.example")).toBe("/crm");
    expect(safeNextPath("//evil.example")).toBe("/crm");
    expect(safeNextPath("/crm\\..\\x")).toBe("/crm");
  });
});

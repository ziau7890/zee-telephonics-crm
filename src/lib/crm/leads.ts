/** Lead, contact, activity and follow-up vocabulary shared by pages, actions and tests. */

export const LEAD_STATUSES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const OPEN_LEAD_STATUSES: readonly LeadStatus[] = ["new", "contacted", "qualified", "proposal", "negotiation"];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal sent",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export const LEAD_STATUS_TONES: Record<LeadStatus, "cyan" | "navy" | "green" | "red" | "amber" | "neutral"> = {
  new: "cyan",
  contacted: "navy",
  qualified: "navy",
  proposal: "amber",
  negotiation: "amber",
  won: "green",
  lost: "red",
};

export const LEAD_PRIORITIES = ["low", "medium", "high"] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

export const SOURCES = ["website", "manual", "referral", "phone", "email", "event", "other"] as const;
export type Source = (typeof SOURCES)[number];
export const SOURCE_LABELS: Record<Source, string> = {
  website: "Website form",
  manual: "Added by staff",
  referral: "Referral",
  phone: "Phone call",
  email: "Email",
  event: "Event",
  other: "Other",
};

export const ACTIVITY_KINDS = ["note", "call", "email", "meeting", "whatsapp"] as const;
export type ManualActivityKind = (typeof ACTIVITY_KINDS)[number];
export const ACTIVITY_LABELS: Record<string, string> = {
  created: "Lead created",
  note: "Note",
  call: "Call",
  email: "Email",
  meeting: "Meeting",
  whatsapp: "WhatsApp",
  status_change: "Status changed",
  assignment: "Reassigned",
};

export const CALL_OUTCOMES = [
  "connected",
  "interested",
  "not_interested",
  "callback_requested",
  "meeting_booked",
  "no_answer",
  "voicemail",
  "busy",
  "wrong_number",
  "do_not_call",
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];
export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  connected: "Connected",
  interested: "Interested",
  not_interested: "Not interested",
  callback_requested: "Callback requested",
  meeting_booked: "Meeting booked",
  no_answer: "No answer",
  voicemail: "Left voicemail",
  busy: "Busy",
  wrong_number: "Wrong number",
  do_not_call: "Do not call",
};

export const FOLLOW_UP_KINDS = ["call", "email", "meeting", "whatsapp", "other"] as const;
export type FollowUpKind = (typeof FOLLOW_UP_KINDS)[number];
export const FOLLOW_UP_KIND_LABELS: Record<FollowUpKind, string> = {
  call: "Call",
  email: "Email",
  meeting: "Meeting",
  whatsapp: "WhatsApp",
  other: "Other",
};
export const FOLLOW_UP_STATUSES = ["open", "done", "cancelled"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export function isLeadStatus(v: unknown): v is LeadStatus {
  return typeof v === "string" && (LEAD_STATUSES as readonly string[]).includes(v);
}

export function isSource(v: unknown): v is Source {
  return typeof v === "string" && (SOURCES as readonly string[]).includes(v);
}

/** Where an open follow-up stands relative to now, in the viewer's day. */
export function followUpState(dueIso: string, status: FollowUpStatus, now: Date, timeZone: string): "done" | "cancelled" | "overdue" | "today" | "upcoming" {
  if (status !== "open") return status;
  const due = new Date(dueIso);
  if (due.getTime() < now.getTime()) return "overdue";
  return dayKey(due, timeZone) === dayKey(now, timeZone) ? "today" : "upcoming";
}

/** "YYYY-MM-DD" of an instant in a time zone. */
export function dayKey(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Digits for tel: and wa.me links, or "" when the number is unusable. */
export function phoneDigits(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/[^\d]/g, "");
  return digits.length >= 6 ? digits : "";
}

/** Strips characters that would break a PostgREST or() filter. */
export function searchTerm(q: string | undefined, max = 80) {
  return (q ?? "").replace(/[%,()*\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Default "due" value for a new follow-up: tomorrow at 10:00 in the viewer's time zone. */
export function defaultDueInput(now: Date, timeZone: string) {
  return `${dayKey(new Date(now.getTime() + 864e5), timeZone)}T10:00`;
}

/** Seconds as "4 min 30 s". */
export function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (!m) return `${s} s`;
  return s ? `${m} min ${s} s` : `${m} min`;
}

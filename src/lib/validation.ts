import { z } from "zod";
import { ACTIVITY_KINDS, CALL_OUTCOMES, FOLLOW_UP_KINDS, LEAD_PRIORITIES, LEAD_STATUSES, SOURCES } from "@/lib/crm/leads";

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "Use at most 128 characters")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number");

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(128),
});

export const emailOnlySchema = z.object({ email });

export const otpSchema = z.object({
  email,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
});

export const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

export const activationSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(120),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

export const timezoneSchema = z.enum([
  "Asia/Karachi",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "UTC",
]);

/** Field errors as { field: firstMessage } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Only allow redirects to CRM paths on this site. */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string") return "/crm";
  if (!next.startsWith("/crm") || next.startsWith("//") || next.includes("\\")) return "/crm";
  return next;
}

// ---------------------------------------------------------------------------
// CRM records
// ---------------------------------------------------------------------------
/** Empty form fields become null; anything else is trimmed and length-checked. */
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`)
    .optional()
    .transform((v) => (v ? v : null));

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.string().email().safeParse(v).success, "Enter a valid email address");

const optionalPhone = z
  .string()
  .trim()
  .max(40)
  .regex(/^[+()\d\s.-]*$/, "Use digits, spaces, +, -, . or brackets only")
  .optional()
  .transform((v) => (v ? v : null));

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.string().uuid().safeParse(v).success, "Choose from the list");

export const contactSchema = z.object({
  full_name: z.string().trim().min(2, "Enter a name").max(120),
  email: optionalEmail,
  phone: optionalPhone,
  company: optional(160),
  job_title: optional(120),
  notes: optional(4000),
  source: z.enum(SOURCES).default("manual"),
  owner_id: optionalUuid,
});

export const leadSchema = z
  .object({
    full_name: z.string().trim().min(2, "Enter a name").max(120),
    email: optionalEmail,
    phone: optionalPhone,
    company: optional(160),
    service_interest: optional(80),
    message: optional(4000),
    source: z.enum(SOURCES).default("manual"),
    status: z.enum(LEAD_STATUSES).default("new"),
    priority: z.enum(LEAD_PRIORITIES).default("medium"),
    owner_id: optionalUuid,
    lost_reason: optional(300),
    contact_id: optionalUuid,
  })
  .refine((v) => v.email || v.phone, { message: "Add an email or a phone number", path: ["email"] });

/** The status/priority/owner panel on a lead page. */
export const leadUpdateSchema = z.object({
  status: z.enum(LEAD_STATUSES),
  priority: z.enum(LEAD_PRIORITIES),
  owner_id: optionalUuid,
  lost_reason: optional(300),
});

export const activitySchema = z
  .object({
    kind: z.enum(ACTIVITY_KINDS),
    body: optional(4000),
    call_outcome: z
      .string()
      .optional()
      .transform((v) => (v ? v : null))
      .pipe(z.enum(CALL_OUTCOMES).nullable()),
    call_minutes: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? Number(v) : null))
      .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 600), "Enter minutes between 0 and 600"),
  })
  .refine((v) => v.kind !== "call" || v.call_outcome, { message: "Choose how the call went", path: ["call_outcome"] })
  .refine((v) => v.kind === "call" || v.body, { message: "Write a short note", path: ["body"] });

export const followUpSchema = z.object({
  title: z.string().trim().min(2, "Say what needs doing").max(160),
  kind: z.enum(FOLLOW_UP_KINDS),
  due_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a date and time"),
  assigned_to: optionalUuid,
  notes: optional(2000),
});

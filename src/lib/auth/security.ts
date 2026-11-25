import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { allowedEmailDomains } from "@/lib/env";

export const LOCKOUT_MAX_FAILURES = 5;
export const LOCKOUT_WINDOW_MINUTES = 15;

type LoginResult =
  | "success"
  | "failed_password"
  | "locked"
  | "blocked_inactive"
  | "blocked_domain"
  | "otp_sent"
  | "otp_verified"
  | "logout"
  | "password_reset";

export async function requestMeta() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 500) ?? null };
}

export function isAllowedCompanyEmail(email: string, domains = allowedEmailDomains()) {
  if (domains.length === 0) return true; // not configured yet: rely on invite-only accounts
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return domains.includes(domain);
}

export async function recordLoginEvent(email: string, result: LoginResult, userId?: string | null) {
  try {
    const { ip, userAgent } = await requestMeta();
    await createAdminClient().from("login_events").insert({
      email: email.toLowerCase(),
      result,
      user_id: userId ?? null,
      ip_address: ip,
      user_agent: userAgent,
    });
  } catch (err) {
    console.error("[auth] could not record login event", err);
  }
}

/** True when this email has too many recent failures and must wait. */
export async function isLockedOut(email: string) {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60_000).toISOString();
  const { count, error } = await createAdminClient()
    .from("login_events")
    .select("id", { count: "exact", head: true })
    .ilike("email", email)
    .eq("result", "failed_password")
    .gte("created_at", since);
  if (error) {
    console.error("[auth] lockout check failed", error);
    return false;
  }
  return (count ?? 0) >= LOCKOUT_MAX_FAILURES;
}

export async function writeAudit(entry: {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}) {
  const { ip } = await requestMeta();
  const { error } = await createAdminClient().from("audit_logs").insert({
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    before_data: entry.before ?? null,
    after_data: entry.after ?? null,
    ip_address: ip,
  });
  if (error) console.error("[audit] write failed", error);
}

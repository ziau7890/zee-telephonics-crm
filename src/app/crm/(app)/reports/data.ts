import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Range, ReportCall, ReportFollowUp, ReportLead } from "@/lib/crm/reports";

const MAX_ROWS = 10000;

/**
 * Loads report rows with the viewer's own access (row-level security applies), so a
 * Team Leader's report only covers their team. Leads are those created, won or closed
 * in the period; calls in the period; follow-ups due or completed in the period, plus
 * everything still open (for the overdue count).
 */
export async function loadReportData(r: Range) {
  const supabase = await createClient();
  const [leads, calls, followUps] = await Promise.all([
    supabase
      .from("leads")
      .select("id, status, source, service_interest, owner_id, created_at, won_at, closed_at")
      .or(`and(created_at.gte.${r.from},created_at.lt.${r.to}),and(closed_at.gte.${r.from},closed_at.lt.${r.to})`)
      .limit(MAX_ROWS),
    supabase.from("lead_activities").select("author_id, call_outcome, created_at").eq("kind", "call").gte("created_at", r.from).lt("created_at", r.to).limit(MAX_ROWS),
    supabase
      .from("follow_ups")
      .select("assigned_to, status, due_at, completed_at")
      .or(`status.eq.open,and(completed_at.gte.${r.from},completed_at.lt.${r.to})`)
      .limit(MAX_ROWS),
  ]);
  const truncated = [leads.data, calls.data, followUps.data].some((d) => (d?.length ?? 0) >= MAX_ROWS);
  return {
    leads: (leads.data ?? []) as ReportLead[],
    calls: (calls.data ?? []) as ReportCall[],
    followUps: (followUps.data ?? []) as ReportFollowUp[],
    truncated,
    failed: Boolean(leads.error || calls.error || followUps.error),
  };
}

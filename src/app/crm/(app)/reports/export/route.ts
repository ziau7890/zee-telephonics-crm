import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { writeAudit } from "@/lib/auth/security";
import { createClient } from "@/lib/supabase/server";
import { resolveRange, toCsv } from "@/lib/crm/reports";
import { LEAD_STATUS_LABELS, SOURCE_LABELS, type LeadStatus, type Source } from "@/lib/crm/leads";

/** CSV of leads created in the period, limited to what the viewer can see. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") return new NextResponse("Sign in first.", { status: 401 });
  if (!can(user.grants, "reports", "export")) return new NextResponse("You do not have permission to export.", { status: 403 });
  const sp = request.nextUrl.searchParams;
  const range = resolveRange({ range: sp.get("range") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("created_at, full_name, company, email, phone, service_interest, status, priority, source, lost_reason, won_at, utm_source, utm_medium, utm_campaign, owner:profiles!leads_owner_id_fkey(full_name, email)")
    .gte("created_at", range.from)
    .lt("created_at", range.to)
    .order("created_at")
    .limit(10000);
  if (error) return new NextResponse("Could not load the leads.", { status: 500 });

  const rows = (data ?? []) as unknown as (Record<string, string | null> & { owner: { full_name: string; email: string } | null })[];
  const csv = toCsv([
    ["Received (UTC)", "Name", "Company", "Email", "Phone", "Service", "Status", "Priority", "Source", "Assigned to", "Lost reason", "Won (UTC)", "UTM source", "UTM medium", "UTM campaign"],
    ...rows.map((l) => [
      l.created_at,
      l.full_name,
      l.company,
      l.email,
      l.phone,
      l.service_interest,
      LEAD_STATUS_LABELS[l.status as LeadStatus] ?? l.status,
      l.priority,
      SOURCE_LABELS[l.source as Source] ?? l.source,
      l.owner ? l.owner.full_name || l.owner.email : "",
      l.lost_reason,
      l.won_at,
      l.utm_source,
      l.utm_medium,
      l.utm_campaign,
    ]),
  ]);
  await writeAudit({ actorId: user.id, action: "report.exported", entityType: "leads", after: { from: range.from, to: range.to, rows: rows.length } });
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zee-leads-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

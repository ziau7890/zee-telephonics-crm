import Link from "next/link";
import { DataTable, EmptyRow, PageHeader, Panel } from "@/components/crm/ui";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getStaffOptions } from "@/lib/crm/server";
import { TeamForm } from "./forms";

export const metadata = { title: "Teams" };

export default async function TeamsPage() {
  const user = await requirePagePermission("teams", "view");
  const canEdit = can(user.grants, "teams", "edit");
  const supabase = await createClient();
  const [{ data }, people] = await Promise.all([
    supabase.from("teams").select("id, name, description, lead:profiles!teams_lead_id_fkey(full_name, email), members:team_members(count)").order("name"),
    canEdit ? getStaffOptions() : Promise.resolve([]),
  ]);
  const teams = (data ?? []) as unknown as { id: string; name: string; description: string | null; lead: { full_name: string; email: string } | null; members: { count: number }[] }[];

  return (
    <>
      <PageHeader title="Teams" description="A team is a leader plus agents. Team Leaders see and manage the leads, contacts and follow-ups owned by their team." />
      <DataTable head={["Team", "Leader", "Members"]} empty={teams.length ? null : <EmptyRow>No teams yet.</EmptyRow>}>
        {teams.map((t) => (
          <tr key={t.id} className="hover:bg-surface-muted/50">
            <td className="px-4 py-3">
              <Link href={`/crm/admin/teams/${t.id}`} className="font-medium hover:text-accent-text hover:underline">
                {t.name}
              </Link>
              {t.description ? <p className="text-xs text-muted">{t.description}</p> : null}
            </td>
            <td className="px-4 py-3">{t.lead ? t.lead.full_name || t.lead.email : <span className="text-muted">Not set</span>}</td>
            <td className="px-4 py-3">{t.members[0]?.count ?? 0}</td>
          </tr>
        ))}
      </DataTable>
      {canEdit ? (
        <Panel title="New team" className="mt-8">
          <TeamForm people={people} />
        </Panel>
      ) : null}
    </>
  );
}

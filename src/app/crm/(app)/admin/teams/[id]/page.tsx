import { notFound } from "next/navigation";
import { UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DangerZone, DataTable, EmptyRow, PageHeader, Panel } from "@/components/crm/ui";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { getStaffOptions } from "@/lib/crm/server";
import { AddMemberForm, TeamForm } from "../forms";
import { deleteTeamAction, removeTeamMemberAction } from "../actions";

export const metadata = { title: "Team" };

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requirePagePermission("teams", "view");
  const canEdit = can(user.grants, "teams", "edit");
  const supabase = await createClient();
  const [{ data: team }, { data: members }, people] = await Promise.all([
    supabase.from("teams").select("id, name, description, lead_id, lead:profiles!teams_lead_id_fkey(full_name, email)").eq("id", id).maybeSingle(),
    supabase.from("team_members").select("user_id, added_at, person:profiles(id, full_name, email, job_title)").eq("team_id", id),
    canEdit ? getStaffOptions() : Promise.resolve([]),
  ]);
  if (!team) notFound();
  const rows = (members ?? []) as unknown as { user_id: string; added_at: string; person: { id: string; full_name: string; email: string; job_title: string | null } | null }[];
  const memberIds = new Set(rows.map((r) => r.user_id));
  const lead = team.lead as unknown as { full_name: string; email: string } | null;

  return (
    <>
      <PageHeader title={team.name} description={lead ? `Led by ${lead.full_name || lead.email}` : "No team leader set"} back={{ href: "/crm/admin/teams", label: "Teams" }} />
      <div className="space-y-8">
        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold">Members</h2>
          <DataTable head={canEdit ? ["Person", "Added", ""] : ["Person", "Added"]} empty={rows.length ? null : <EmptyRow>No members yet.</EmptyRow>}>
            {rows.map((r) => (
              <tr key={r.user_id}>
                <td className="px-4 py-3">
                  <span className="font-medium">{r.person ? r.person.full_name || r.person.email : "Former staff member"}</span>
                  {r.person?.job_title ? <p className="text-xs text-muted">{r.person.job_title}</p> : null}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(r.added_at, user.timezone, { timeStyle: undefined })}</td>
                {canEdit ? (
                  <td className="px-4 py-3 text-right">
                    <form action={removeTeamMemberAction}>
                      <input type="hidden" name="team_id" value={team.id} />
                      <input type="hidden" name="user_id" value={r.user_id} />
                      <Button type="submit" variant="ghost" size="sm" aria-label={`Remove ${r.person?.full_name ?? "member"}`}>
                        <UserMinus className="size-4" aria-hidden /> Remove
                      </Button>
                    </form>
                  </td>
                ) : null}
              </tr>
            ))}
          </DataTable>
          {canEdit ? <AddMemberForm teamId={team.id} people={people.filter((o) => !memberIds.has(o.id))} /> : null}
        </section>
        {canEdit ? (
          <Panel title="Team details">
            <TeamForm team={team} people={people} />
          </Panel>
        ) : null}
        {can(user.grants, "teams", "delete") ? (
          <DangerZone label="Delete this team" confirmLabel="Yes, delete the team" note="Members keep their accounts and records. Their Team Leader loses team access to them." action={deleteTeamAction} fields={{ id: team.id }} />
        ) : null}
      </div>
    </>
  );
}

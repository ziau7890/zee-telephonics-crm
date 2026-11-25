import { notFound } from "next/navigation";
import { DataTable, EmptyRow, PageHeader, Panel, StatusBadge } from "@/components/crm/ui";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { UserRolesForm, UserStatusForm } from "../../forms";

export const metadata = { title: "User" };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requirePagePermission("users", "view");
  const canEditStatus = can(user.grants, "users", "edit") && id !== user.id;
  const canAssign = can(user.grants, "users", "manage");
  const canAudit = can(user.grants, "audit_logs", "view");
  const supabase = await createClient();

  const [{ data: person }, { data: assigned }, { data: roles }, { data: logins }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, status, created_at, activated_at, deactivated_at").eq("id", id).maybeSingle(),
    supabase.from("user_roles").select("role_id, assigned_at, role:roles(name)").eq("user_id", id),
    supabase.from("roles").select("id, name, description").order("name"),
    canAudit ? supabase.from("login_events").select("id, result, ip_address, user_agent, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(20) : { data: [] },
  ]);
  if (!person) notFound();
  const assignedRows = (assigned ?? []) as unknown as { role_id: string; assigned_at: string; role: { name: string } | null }[];

  return (
    <>
      <PageHeader
        title={person.full_name || person.email}
        description={person.email}
        back={{ href: "/crm/admin/users", label: "Users" }}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={person.status} />
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Roles">
          {canAssign ? (
            <UserRolesForm id={person.id} roles={roles ?? []} assigned={assignedRows.map((r) => r.role_id)} />
          ) : assignedRows.length ? (
            <ul className="space-y-1 text-sm">
              {assignedRows.map((r) => (
                <li key={r.role_id}>{r.role?.name}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No role assigned. Only a Super Admin can assign roles.</p>
          )}
        </Panel>
        <Panel title="Account">
          <dl className="mb-6 space-y-3 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted">Invited</dt>
              <dd>{formatDateTime(person.created_at, user.timezone)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted">Activated</dt>
              <dd>{person.activated_at ? formatDateTime(person.activated_at, user.timezone) : "Not yet"}</dd>
            </div>
            {person.deactivated_at ? (
              <div>
                <dt className="text-xs font-medium text-muted">Deactivated</dt>
                <dd>{formatDateTime(person.deactivated_at, user.timezone)}</dd>
              </div>
            ) : null}
          </dl>
          {canEditStatus && person.status !== "invited" ? <UserStatusForm id={person.id} status={person.status} /> : null}
          {person.status === "invited" ? <p className="text-sm text-muted">Waiting for them to open the invitation and set a password.</p> : null}
          {id === user.id ? <p className="text-sm text-muted">This is your own account.</p> : null}
        </Panel>
      </div>
      {canAudit ? (
        <section className="mt-8 space-y-4">
          <h2 className="font-display text-xl font-bold">Recent sign-in activity</h2>
          <DataTable head={["When", "Result", "IP address", "Device"]} empty={logins?.length ? null : <EmptyRow>No activity recorded.</EmptyRow>}>
            {(logins ?? []).map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(l.created_at, user.timezone)}</td>
                <td className="px-4 py-3 capitalize">{String(l.result).replace(/_/g, " ")}</td>
                <td className="px-4 py-3 font-mono text-xs">{l.ip_address ?? ""}</td>
                <td className="max-w-64 truncate px-4 py-3 text-xs text-muted" title={l.user_agent ?? ""}>
                  {l.user_agent ?? ""}
                </td>
              </tr>
            ))}
          </DataTable>
        </section>
      ) : null}
    </>
  );
}

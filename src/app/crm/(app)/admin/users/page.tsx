import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { DataTable, EmptyRow, PageHeader, Panel, StatusBadge } from "@/components/crm/ui";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { allowedEmailDomains } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { InviteUserForm } from "../forms";

export const metadata = { title: "Users" };

interface Row {
  id: string;
  full_name: string;
  email: string;
  status: string;
  created_at: string;
  roles: { role: { name: string } | null }[];
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q, status } = await searchParams;
  const user = await requirePagePermission("users", "view");
  const canInvite = can(user.grants, "users", "create");
  const canAssign = can(user.grants, "users", "manage");
  const supabase = await createClient();

  let query = supabase
    .from("profiles")
    .select("id, full_name, email, status, created_at, roles:user_roles!user_roles_user_id_fkey(role:roles(name))")
    .order("created_at", { ascending: false })
    .limit(500);
  const term = q?.trim().replace(/[%,()]/g, "");
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
  if (status === "invited" || status === "active" || status === "deactivated") query = query.eq("status", status);

  const [{ data }, { data: roles }, { data: logins }] = await Promise.all([
    query,
    supabase.from("roles").select("id, name").order("name"),
    can(user.grants, "audit_logs", "view")
      ? supabase.from("login_events").select("user_id, created_at").eq("result", "success").order("created_at", { ascending: false }).limit(1000)
      : { data: [] },
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const lastSignIn = new Map<string, string>();
  for (const l of logins ?? []) if (l.user_id && !lastSignIn.has(l.user_id)) lastSignIn.set(l.user_id, l.created_at);

  return (
    <>
      <PageHeader title="Users" description="CRM accounts. Accounts are invite-only and limited to company email addresses." />
      {canInvite ? (
        <Panel title="Invite someone" className="mb-8">
          <InviteUserForm roles={roles ?? []} canAssignRoles={canAssign} domains={allowedEmailDomains()} />
        </Panel>
      ) : null}
      <form className="mb-4 flex flex-wrap items-end gap-3" role="search">
        <label className="text-sm">
          <span className="mb-1 block text-muted">Search</span>
          <Input name="q" defaultValue={q ?? ""} placeholder="Name or email" className="min-w-64" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Account</span>
          <Select name="status" defaultValue={status ?? ""} className="min-w-40">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="deactivated">Deactivated</option>
          </Select>
        </label>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      <DataTable head={["Person", "Roles", "Last sign-in", "Account"]} empty={rows.length ? null : <EmptyRow>No accounts match.</EmptyRow>}>
        {rows.map((r) => {
          const roleNames = r.roles.map((x) => x.role?.name).filter(Boolean);
          const last = lastSignIn.get(r.id);
          return (
            <tr key={r.id} className="hover:bg-surface-muted/50">
              <td className="px-4 py-3">
                <Link href={`/crm/admin/users/${r.id}`} className="font-medium hover:text-accent-text hover:underline">
                  {r.full_name || r.email}
                </Link>
                <p className="text-xs text-muted">{r.email}</p>
              </td>
              <td className="px-4 py-3">{roleNames.length ? roleNames.join(", ") : <span className="text-muted">None</span>}</td>
              <td className="px-4 py-3 whitespace-nowrap">{last ? formatDateTime(last, user.timezone) : <span className="text-muted">Never</span>}</td>
              <td className="px-4 py-3">
                <StatusBadge status={r.status} />
              </td>
            </tr>
          );
        })}
      </DataTable>
    </>
  );
}

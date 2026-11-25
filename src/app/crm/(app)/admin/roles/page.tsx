import Link from "next/link";
import { Badge, DataTable, EmptyRow, PageHeader, Panel } from "@/components/crm/ui";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { RoleForm } from "../forms";

export const metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  const user = await requirePagePermission("roles", "view");
  const canManage = can(user.grants, "roles", "manage");
  const supabase = await createClient();
  const { data } = await supabase.from("roles").select("id, key, name, description, is_system, users:user_roles(count), grants:role_permissions(count)").order("is_system", { ascending: false }).order("name");
  const roles = (data ?? []) as unknown as { id: string; key: string; name: string; description: string | null; is_system: boolean; users: { count: number }[]; grants: { count: number }[] }[];

  return (
    <>
      <PageHeader title="Roles & permissions" description="Each role is a set of module permissions. People can hold more than one role; their access is the combination." />
      <DataTable head={["Role", "People", "Permissions", ""]} empty={roles.length ? null : <EmptyRow>No roles.</EmptyRow>}>
        {roles.map((r) => (
          <tr key={r.id} className="hover:bg-surface-muted/50">
            <td className="px-4 py-3">
              <Link href={`/crm/admin/roles/${r.id}`} className="font-medium hover:text-accent-text hover:underline">
                {r.name}
              </Link>
              {r.description ? <p className="max-w-xl text-xs text-muted">{r.description}</p> : null}
            </td>
            <td className="px-4 py-3">{r.users[0]?.count ?? 0}</td>
            <td className="px-4 py-3">{r.key === "super_admin" ? "Everything" : (r.grants[0]?.count ?? 0)}</td>
            <td className="px-4 py-3">{r.is_system ? <Badge tone="navy">Built-in</Badge> : <Badge>Custom</Badge>}</td>
          </tr>
        ))}
      </DataTable>
      {canManage ? (
        <Panel title="Create a custom role" className="mt-8">
          <p className="mb-4 text-sm text-muted">Start with a name, then choose its permissions on the next page. New roles have no access until you grant it.</p>
          <RoleForm />
        </Panel>
      ) : null}
    </>
  );
}

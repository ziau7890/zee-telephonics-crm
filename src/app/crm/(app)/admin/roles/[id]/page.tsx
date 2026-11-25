import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form";
import { Badge, PageHeader, Panel } from "@/components/crm/ui";
import { requirePagePermission } from "@/lib/auth/session";
import { can, type PermissionScope } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { PermissionMatrix, RoleForm } from "../../forms";
import { deleteRoleAction } from "../../actions";

export const metadata = { title: "Role" };

const SCOPE_RANK: Record<PermissionScope, number> = { all: 3, team: 2, own: 1 };

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requirePagePermission("roles", "view");
  const canManage = can(user.grants, "roles", "manage");
  const supabase = await createClient();
  const [{ data: role }, { data: grants }, { count: people }] = await Promise.all([
    supabase.from("roles").select("id, key, name, description, is_system").eq("id", id).maybeSingle(),
    supabase.from("role_permissions").select("scope, permission:permissions(module, action)").eq("role_id", id),
    supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role_id", id),
  ]);
  if (!role) notFound();
  const isSuper = role.key === "super_admin";

  const granted: string[] = [];
  const scopes: Record<string, PermissionScope> = {};
  for (const g of (grants ?? []) as unknown as { scope: PermissionScope; permission: { module: string; action: string } | null }[]) {
    if (!g.permission) continue;
    granted.push(`${g.permission.module}:${g.permission.action}`);
    const prev = scopes[g.permission.module];
    if (!prev || SCOPE_RANK[g.scope] > SCOPE_RANK[prev]) scopes[g.permission.module] = g.scope;
  }

  return (
    <>
      <PageHeader
        title={role.name}
        description={role.description ?? undefined}
        back={{ href: "/crm/admin/roles", label: "Roles & permissions" }}
        actions={
          <div className="flex items-center gap-3">
            <Badge tone="navy">
              {people ?? 0} {people === 1 ? "person" : "people"}
            </Badge>
            {canManage && !role.is_system ? (
              <form action={deleteRoleAction}>
                <input type="hidden" name="id" value={role.id} />
                <Button type="submit" variant="ghost" size="sm" className="text-danger">
                  <Trash2 className="size-4" aria-hidden /> Delete role
                </Button>
              </form>
            ) : null}
          </div>
        }
      />
      {isSuper ? (
        <div className="mb-6">
          <FormAlert tone="success">Super Admin always has full access, so nobody can lock the company out of its own CRM.</FormAlert>
        </div>
      ) : null}
      {canManage && !isSuper ? (
        <Panel title="Name and description" className="mb-8">
          <RoleForm role={role} />
        </Panel>
      ) : null}
      <h2 className="mb-4 font-display text-xl font-bold">Permissions</h2>
      <PermissionMatrix roleId={role.id} granted={granted} scopes={scopes} readOnly={!canManage || isSuper} />
    </>
  );
}

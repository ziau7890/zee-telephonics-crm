import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { can, type PermissionAction, type PermissionGrant } from "./permissions";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  timezone: string;
  status: "invited" | "active" | "deactivated";
  roles: { key: string; name: string }[];
  grants: PermissionGrant[];
}

/**
 * Loads the signed-in user with their profile, roles and permissions.
 * Cached per request so layouts and pages share one lookup.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: roleRows }, { data: grants }] = await Promise.all([
    supabase.from("profiles").select("email, full_name, timezone, status").eq("id", user.id).single(),
    supabase.from("user_roles").select("roles(key, name)").eq("user_id", user.id),
    supabase.rpc("my_permissions"),
  ]);
  if (!profile) return null;

  const roles = (roleRows ?? [])
    .map((r) => r.roles as unknown as { key: string; name: string } | null)
    .filter((r): r is { key: string; name: string } => Boolean(r));

  return {
    id: user.id,
    email: profile.email,
    fullName: profile.full_name,
    timezone: profile.timezone,
    status: profile.status,
    roles,
    grants: (grants ?? []) as PermissionGrant[],
  };
});

/** For CRM pages and actions: an active, signed-in user or a redirect. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");
  if (user.status === "invited") redirect("/crm/activate");
  if (user.status !== "active") {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/crm/login?error=inactive");
  }
  return user;
}

export class ForbiddenError extends Error {
  constructor(module: string, action: PermissionAction) {
    super(`Missing permission ${module}:${action}`);
    this.name = "ForbiddenError";
  }
}

/** Server-side permission gate for actions and API routes. */
export async function requirePermission(module: string, action: PermissionAction) {
  const user = await requireUser();
  if (!can(user.grants, module, action)) throw new ForbiddenError(module, action);
  return user;
}

/** For CRM pages: users without the permission go back to the dashboard with a notice. */
export async function requirePagePermission(module: string, action: PermissionAction = "view") {
  const user = await requireUser();
  if (!can(user.grants, module, action)) redirect("/crm?notice=forbidden");
  return user;
}

/** For server actions: the user, or a form error when the permission is missing. */
export async function guardAction(module: string, action: PermissionAction) {
  const user = await requireUser();
  if (!can(user.grants, module, action)) {
    return { user: null, denied: { error: "You do not have permission to do that." } } as const;
  }
  return { user, denied: null } as const;
}

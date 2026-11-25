"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { guardAction } from "@/lib/auth/session";
import { isAllowedCompanyEmail, writeAudit } from "@/lib/auth/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { fieldErrors } from "@/lib/validation";
import { parseMatrix } from "@/lib/crm/matrix";
import type { FormState } from "@/lib/form-state";

// ---------------------------------------------------------------------------
// Users: invite, activate/deactivate, roles
// ---------------------------------------------------------------------------
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  full_name: z.string().trim().min(2, "Enter their full name").max(120),
  role_id: z
    .string()
    .trim()
    .transform((v) => v || null)
    .refine((v) => v === null || z.string().uuid().safeParse(v).success, "Choose a role"),
});

export async function inviteUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, denied } = await guardAction("users", "create");
  if (denied) return denied;
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const { email, full_name, role_id } = parsed.data;
  if (!isAllowedCompanyEmail(email)) return { fields: { email: "Only company email addresses can have CRM accounts." } };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) return { fields: { email: "This person already has an account." } };

  // Inviting creates an auth user, which needs the service role.
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name },
    redirectTo: `${publicEnv.siteUrl}/crm/auth/confirm`,
  });
  if (error || !data.user) {
    if (error?.status === 429) return { error: "The email service is busy. Please wait a few minutes and try again." };
    return { error: "Could not send the invitation. Check the address and try again." };
  }

  let roleNote = "";
  if (role_id) {
    // Assigning roles still goes through row-level security as the inviter.
    const { error: roleError } = await supabase.from("user_roles").insert({ user_id: data.user.id, role_id, assigned_by: user.id });
    if (roleError) roleNote = " The role was not assigned, because assigning roles needs the users:manage permission.";
  }
  await writeAudit({ actorId: user.id, action: "user.invited", entityType: "profile", entityId: data.user.id, after: { email, full_name, role_id } });
  revalidatePath("/crm/admin/users");
  return { message: `Invitation sent to ${email}. It stays "Invited" until they open the email and set a password.${roleNote}` };
}

const userIdSchema = z.object({ id: z.string().uuid() });

export async function setUserStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, denied } = await guardAction("users", "edit");
  if (denied) return denied;
  const parsed = userIdSchema.extend({ status: z.enum(["active", "deactivated"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Something went wrong. Reload the page and try again." };
  const { id, status } = parsed.data;
  if (id === user.id) return { error: "You cannot change your own account status." };

  const supabase = await createClient();
  const { data: before } = await supabase.from("profiles").select("status").eq("id", id).single();
  if (!before) return { error: "That account was not found." };
  if (before.status === "invited" && status === "active") return { error: "This person has not accepted their invitation yet." };
  const { error } = await supabase
    .from("profiles")
    .update({ status, deactivated_at: status === "deactivated" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) {
    if (error.message.includes("Super Admin")) return { error: "At least one active Super Admin must remain." };
    return { error: "Could not change the account status." };
  }
  await writeAudit({ actorId: user.id, action: status === "active" ? "user.reactivated" : "user.deactivated", entityType: "profile", entityId: id, before, after: { status } });
  revalidatePath(`/crm/admin/users/${id}`);
  revalidatePath("/crm/admin/users");
  return { message: status === "active" ? "Account reactivated." : "Account deactivated. They are signed out on their next request." };
}

export async function setUserRolesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, denied } = await guardAction("users", "manage");
  if (denied) return denied;
  const parsed = userIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Something went wrong. Reload the page and try again." };
  const id = parsed.data.id;
  const wanted = formData.getAll("role_id").map(String).filter((v) => z.string().uuid().safeParse(v).success);

  const supabase = await createClient();
  const { data: current } = await supabase.from("user_roles").select("role_id").eq("user_id", id);
  const have = new Set((current ?? []).map((r) => r.role_id));
  const add = wanted.filter((r) => !have.has(r));
  const remove = [...have].filter((r) => !wanted.includes(r));

  if (add.length) {
    const { error } = await supabase.from("user_roles").insert(add.map((role_id) => ({ user_id: id, role_id, assigned_by: user.id })));
    if (error) return { error: "Could not assign the roles." };
  }
  if (remove.length) {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", id).in("role_id", remove);
    if (error) {
      if (error.message.includes("Super Admin")) return { error: "At least one active Super Admin must remain, so that role was kept." };
      return { error: "Could not remove the roles." };
    }
  }
  if (add.length || remove.length) {
    await writeAudit({ actorId: user.id, action: "user.roles_changed", entityType: "profile", entityId: id, before: [...have], after: wanted });
  }
  revalidatePath(`/crm/admin/users/${id}`);
  revalidatePath("/crm/admin/users");
  return { message: "Roles saved. They apply on the person's next page load." };
}

// ---------------------------------------------------------------------------
// Roles and the permission matrix
// ---------------------------------------------------------------------------
const roleSchema = z.object({
  id: z.string().trim(),
  name: z.string().trim().min(2, "Enter a role name").max(60),
  description: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null),
});

function roleKey(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export async function saveRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, denied } = await guardAction("roles", "manage");
  if (denied) return denied;
  const parsed = roleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const { id, name, description } = parsed.data;
  const supabase = await createClient();
  if (id) {
    const { data: before } = await supabase.from("roles").select("name, description").eq("id", id).single();
    const { error } = await supabase.from("roles").update({ name, description }).eq("id", id);
    if (error) return { error: "Could not save the role." };
    await writeAudit({ actorId: user.id, action: "role.updated", entityType: "role", entityId: id, before, after: { name, description } });
    revalidatePath(`/crm/admin/roles/${id}`);
    return { message: "Role saved." };
  }
  const key = roleKey(name);
  if (!key) return { fields: { name: "Use letters or numbers in the name" } };
  const { data, error } = await supabase.from("roles").insert({ key, name, description }).select("id").single();
  if (error) return error.code === "23505" ? { fields: { name: "A role with this name already exists" } } : { error: "Could not create the role." };
  await writeAudit({ actorId: user.id, action: "role.created", entityType: "role", entityId: data.id, after: { key, name, description } });
  redirect(`/crm/admin/roles/${data.id}`);
}

export async function saveRolePermissionsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, denied } = await guardAction("roles", "manage");
  if (denied) return denied;
  const parsed = userIdSchema.safeParse({ id: formData.get("role_id") });
  if (!parsed.success) return { error: "Something went wrong. Reload the page and try again." };
  const roleId = parsed.data.id;
  const grants = parseMatrix(formData);

  const supabase = await createClient();
  const { data: before } = await supabase.from("role_permissions").select("scope, permission:permissions(module, action)").eq("role_id", roleId);
  const { error } = await supabase.rpc("set_role_permissions", { p_role_id: roleId, p_grants: grants });
  if (error) {
    if (error.message.includes("Super Admin")) return { error: "Super Admin permissions are fixed so nobody can lock themselves out." };
    return { error: "Could not save the permissions." };
  }
  await writeAudit({ actorId: user.id, action: "role.permissions_changed", entityType: "role", entityId: roleId, before, after: grants });
  revalidatePath(`/crm/admin/roles/${roleId}`);
  revalidatePath("/crm", "layout");
  return { message: `Saved ${grants.length} permissions. They apply on each person's next page load.` };
}

export async function deleteRoleAction(formData: FormData) {
  const { user, denied } = await guardAction("roles", "manage");
  if (denied) return;
  const parsed = userIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const supabase = await createClient();
  const { data: before } = await supabase.from("roles").select("key, name, is_system").eq("id", parsed.data.id).single();
  if (!before || before.is_system) return;
  const { error } = await supabase.from("roles").delete().eq("id", parsed.data.id);
  if (!error) await writeAudit({ actorId: user.id, action: "role.deleted", entityType: "role", entityId: parsed.data.id, before });
  revalidatePath("/crm/admin/roles");
  redirect("/crm/admin/roles");
}

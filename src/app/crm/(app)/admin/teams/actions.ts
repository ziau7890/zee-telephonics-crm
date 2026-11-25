"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { guardAction } from "@/lib/auth/session";
import { writeAudit } from "@/lib/auth/security";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";

const teamSchema = z.object({
  id: z.string().trim(),
  name: z.string().trim().min(2, "Enter a team name").max(80),
  description: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null),
  lead_id: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.string().uuid().nullable()),
});

export async function saveTeamAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, denied } = await guardAction("teams", "edit");
  if (denied) return denied;
  const parsed = teamSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const { id, ...row } = parsed.data;
  if (id && !z.string().uuid().safeParse(id).success) return { error: "Something went wrong. Reload the page and try again." };
  const supabase = await createClient();
  const { data: before } = id ? await supabase.from("teams").select("name, description, lead_id").eq("id", id).single() : { data: null };
  const result = id ? await supabase.from("teams").update(row).eq("id", id).select("id").single() : await supabase.from("teams").insert(row).select("id").single();
  if (result.error) {
    if (result.error.code === "23505") return { fields: { name: "A team with this name already exists" } };
    return { error: "Could not save the team." };
  }
  await writeAudit({ actorId: user.id, action: id ? "team.updated" : "team.created", entityType: "team", entityId: result.data.id, before, after: row });
  revalidatePath("/crm/admin/teams");
  if (!id) redirect(`/crm/admin/teams/${result.data.id}`);
  revalidatePath(`/crm/admin/teams/${id}`);
  return { message: "Team saved." };
}

const memberSchema = z.object({ team_id: z.string().uuid(), user_id: z.string().uuid("Choose a person") });

export async function addTeamMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, denied } = await guardAction("teams", "edit");
  if (denied) return denied;
  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("team_members").insert(parsed.data);
  if (error) return { error: error.code === "23505" ? "That person is already in this team." : "Could not add the member." };
  await writeAudit({ actorId: user.id, action: "team.member_added", entityType: "team", entityId: parsed.data.team_id, after: parsed.data });
  revalidatePath(`/crm/admin/teams/${parsed.data.team_id}`);
  return { message: "Added." };
}

export async function removeTeamMemberAction(formData: FormData) {
  const { user, denied } = await guardAction("teams", "edit");
  if (denied) return;
  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("team_members").delete().match(parsed.data);
  if (!error) await writeAudit({ actorId: user.id, action: "team.member_removed", entityType: "team", entityId: parsed.data.team_id, before: parsed.data });
  revalidatePath(`/crm/admin/teams/${parsed.data.team_id}`);
}

export async function deleteTeamAction(formData: FormData) {
  const { user, denied } = await guardAction("teams", "delete");
  if (denied) return;
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { data: before } = await supabase.from("teams").select("*").eq("id", id.data).single();
  const { error } = await supabase.from("teams").delete().eq("id", id.data);
  if (!error) await writeAudit({ actorId: user.id, action: "team.deleted", entityType: "team", entityId: id.data, before });
  revalidatePath("/crm/admin/teams");
  redirect("/crm/admin/teams");
}

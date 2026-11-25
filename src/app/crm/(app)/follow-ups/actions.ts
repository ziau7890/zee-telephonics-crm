"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guardAction } from "@/lib/auth/session";
import { permissionScope } from "@/lib/auth/permissions";
import { writeAudit } from "@/lib/auth/security";
import { createClient } from "@/lib/supabase/server";
import { localInputToUtc } from "@/lib/format";
import { fieldErrors, followUpSchema } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";

const uuid = z.string().uuid();
const optionalUuid = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(uuid.nullable());

function refresh(leadId: string | null, contactId: string | null) {
  revalidatePath("/crm/follow-ups");
  revalidatePath("/crm");
  if (leadId) revalidatePath(`/crm/leads/${leadId}`);
  if (contactId) revalidatePath(`/crm/contacts/${contactId}`);
}

export async function createFollowUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, denied } = await guardAction("follow_ups", "create");
  if (denied) return denied;
  const parent = z.object({ lead_id: optionalUuid, contact_id: optionalUuid }).safeParse({ lead_id: formData.get("lead_id") ?? "", contact_id: formData.get("contact_id") ?? "" });
  if (!parent.success || (!parent.data.lead_id && !parent.data.contact_id)) return { error: "Something went wrong. Reload the page and try again." };
  const parsed = followUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const v = parsed.data;
  const dueAt = localInputToUtc(v.due_at, user.timezone);
  if (!dueAt) return { fields: { due_at: "Choose a date and time" } };
  const assignee = permissionScope(user.grants, "follow_ups", "create") === "own" ? user.id : (v.assigned_to ?? user.id);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("follow_ups")
    .insert({ ...parent.data, title: v.title, kind: v.kind, due_at: dueAt, assigned_to: assignee, notes: v.notes, created_by: user.id })
    .select("id")
    .single();
  if (error) {
    return { error: error.code === "42501" ? "You can't assign follow-ups to that person." : "Could not save the follow-up." };
  }
  await writeAudit({ actorId: user.id, action: "follow_up.created", entityType: "follow_up", entityId: data.id, after: { ...parent.data, ...v, due_at: dueAt, assigned_to: assignee } });
  refresh(parent.data.lead_id, parent.data.contact_id);
  return { message: "Follow-up scheduled." };
}

/** Mark done, cancel or reopen. */
export async function setFollowUpStatusAction(formData: FormData) {
  const { user, denied } = await guardAction("follow_ups", "edit");
  if (denied) return;
  const parsed = z.object({ id: uuid, status: z.enum(["open", "done", "cancelled"]) }).safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return;
  const supabase = await createClient();
  const { data: before } = await supabase.from("follow_ups").select("status, lead_id, contact_id").eq("id", parsed.data.id).maybeSingle();
  if (!before) return;
  const { error } = await supabase.from("follow_ups").update({ status: parsed.data.status }).eq("id", parsed.data.id);
  if (error) return;
  await writeAudit({ actorId: user.id, action: `follow_up.${parsed.data.status === "open" ? "reopened" : parsed.data.status}`, entityType: "follow_up", entityId: parsed.data.id, before: { status: before.status }, after: { status: parsed.data.status } });
  refresh(before.lead_id, before.contact_id);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { guardAction } from "@/lib/auth/session";
import { permissionScope } from "@/lib/auth/permissions";
import { writeAudit } from "@/lib/auth/security";
import { createClient } from "@/lib/supabase/server";
import { activitySchema, fieldErrors, leadSchema, leadUpdateSchema } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";

const id = z.string().uuid();

function refresh(leadId?: string) {
  revalidatePath("/crm/leads");
  revalidatePath("/crm");
  if (leadId) revalidatePath(`/crm/leads/${leadId}`);
}

/** Readable message for errors the database raises (row-level security and checks). */
function dbError(code: string | undefined, fallback: string) {
  if (code === "42501") return "You don't have access to save this. Agents can only keep records assigned to themselves.";
  if (code === "23505") return "A record with this email already exists.";
  return fallback;
}

export async function createLeadAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, denied } = await guardAction("leads", "create");
  if (denied) return denied;
  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const v = parsed.data;
  // People who can only work their own records always own what they create.
  const owner = permissionScope(user.grants, "leads", "create") === "own" ? user.id : (v.owner_id ?? user.id);

  const supabase = await createClient();
  let contactId = v.contact_id;
  if (!contactId && v.email) {
    const { data: existing } = await supabase.from("contacts").select("id").eq("email", v.email).maybeSingle();
    contactId = existing?.id ?? null;
  }
  const { data, error } = await supabase
    .from("leads")
    .insert({
      full_name: v.full_name,
      email: v.email,
      phone: v.phone,
      company: v.company,
      service_interest: v.service_interest,
      message: v.message,
      source: v.source,
      status: v.status,
      priority: v.priority,
      owner_id: owner,
      contact_id: contactId,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { error: dbError(error.code, "Could not save the lead.") };
  await writeAudit({ actorId: user.id, action: "lead.created", entityType: "lead", entityId: data.id, after: { ...v, owner_id: owner } });
  refresh();
  redirect(`/crm/leads/${data.id}`);
}

export async function updateLeadDetailsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, denied } = await guardAction("leads", "edit");
  if (denied) return denied;
  const leadId = id.safeParse(formData.get("id"));
  if (!leadId.success) return { error: "Something went wrong. Reload the page and try again." };
  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const { data: before } = await supabase.from("leads").select("full_name, email, phone, company, service_interest, message, source").eq("id", leadId.data).maybeSingle();
  if (!before) return { error: "This lead no longer exists or you can't edit it." };
  const after = { full_name: v.full_name, email: v.email, phone: v.phone, company: v.company, service_interest: v.service_interest, message: v.message, source: v.source };
  const { data: saved, error } = await supabase.from("leads").update(after).eq("id", leadId.data).select("id");
  if (error || !saved?.length) return { error: dbError(error?.code, "Could not save the lead.") };
  await writeAudit({ actorId: user.id, action: "lead.details_updated", entityType: "lead", entityId: leadId.data, before, after });
  refresh(leadId.data);
  return { message: "Details saved." };
}

export async function updateLeadStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, denied } = await guardAction("leads", "edit");
  if (denied) return denied;
  const leadId = id.safeParse(formData.get("id"));
  if (!leadId.success) return { error: "Something went wrong. Reload the page and try again." };
  const parsed = leadUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const v = parsed.data;
  if (v.status === "lost" && !v.lost_reason) return { fields: { lost_reason: "Say briefly why it was lost, so reports stay useful" } };

  const supabase = await createClient();
  const { data: before } = await supabase.from("leads").select("status, priority, owner_id, lost_reason").eq("id", leadId.data).maybeSingle();
  if (!before) return { error: "This lead no longer exists or you can't edit it." };
  const after = { status: v.status, priority: v.priority, owner_id: v.owner_id, lost_reason: v.status === "lost" ? v.lost_reason : null };
  const { data: saved, error } = await supabase.from("leads").update(after).eq("id", leadId.data).select("id");
  if (error) return { error: dbError(error.code, "Could not save the lead.") };
  if (!saved?.length) return { error: "You can't move this lead to that person. Ask your manager to reassign it." };
  await writeAudit({ actorId: user.id, action: "lead.updated", entityType: "lead", entityId: leadId.data, before, after });
  refresh(leadId.data);
  return { message: "Saved." };
}

export async function addActivityAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, denied } = await guardAction("leads", "edit");
  if (denied) return denied;
  const leadId = id.safeParse(formData.get("lead_id"));
  if (!leadId.success) return { error: "Something went wrong. Reload the page and try again." };
  const parsed = activitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("lead_activities").insert({
    lead_id: leadId.data,
    kind: v.kind,
    body: v.body,
    call_outcome: v.kind === "call" ? v.call_outcome : null,
    call_seconds: v.kind === "call" && v.call_minutes !== null ? Math.round(v.call_minutes * 60) : null,
    author_id: user.id,
  });
  if (error) return { error: dbError(error.code, "Could not save the entry.") };
  refresh(leadId.data);
  return { message: v.kind === "call" ? "Call logged." : "Saved to the timeline." };
}

export async function deleteLeadAction(formData: FormData) {
  const { user, denied } = await guardAction("leads", "delete");
  if (denied) return;
  const leadId = id.safeParse(formData.get("id"));
  if (!leadId.success) return;
  const supabase = await createClient();
  const { data: before } = await supabase.from("leads").select("*").eq("id", leadId.data).maybeSingle();
  if (!before) return;
  const { error } = await supabase.from("leads").delete().eq("id", leadId.data);
  if (error) return;
  await writeAudit({ actorId: user.id, action: "lead.deleted", entityType: "lead", entityId: leadId.data, before });
  refresh();
  redirect("/crm/leads?notice=deleted");
}

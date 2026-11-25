"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { guardAction } from "@/lib/auth/session";
import { permissionScope } from "@/lib/auth/permissions";
import { writeAudit } from "@/lib/auth/security";
import { createClient } from "@/lib/supabase/server";
import { contactSchema, fieldErrors } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";

const uuid = z.string().uuid();

function dbError(code: string | undefined, fallback: string): FormState {
  if (code === "23505") return { fields: { email: "A contact with this email already exists. Search for it instead." } };
  if (code === "42501") return { error: "You don't have access to save this. Agents can only keep contacts assigned to themselves." };
  return { error: fallback };
}

export async function createContactAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, denied } = await guardAction("contacts", "create");
  if (denied) return denied;
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const v = parsed.data;
  const owner = permissionScope(user.grants, "contacts", "create") === "own" ? user.id : (v.owner_id ?? user.id);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .insert({ ...v, owner_id: owner, created_by: user.id })
    .select("id")
    .single();
  if (error) return dbError(error.code, "Could not save the contact.");
  await writeAudit({ actorId: user.id, action: "contact.created", entityType: "contact", entityId: data.id, after: { ...v, owner_id: owner } });
  revalidatePath("/crm/contacts");
  redirect(`/crm/contacts/${data.id}`);
}

export async function updateContactAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, denied } = await guardAction("contacts", "edit");
  if (denied) return denied;
  const contactId = uuid.safeParse(formData.get("id"));
  if (!contactId.success) return { error: "Something went wrong. Reload the page and try again." };
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data: before } = await supabase.from("contacts").select("full_name, email, phone, company, job_title, notes, source, owner_id").eq("id", contactId.data).maybeSingle();
  if (!before) return { error: "This contact no longer exists or you can't edit it." };
  // The owner field is only on the form for people who can reassign; otherwise keep the current owner.
  const after = { ...parsed.data, owner_id: formData.has("owner_id") ? parsed.data.owner_id : before.owner_id };
  const { data: saved, error } = await supabase.from("contacts").update(after).eq("id", contactId.data).select("id");
  if (error) return dbError(error.code, "Could not save the contact.");
  if (!saved?.length) return { error: "You can't move this contact to that person." };
  await writeAudit({ actorId: user.id, action: "contact.updated", entityType: "contact", entityId: contactId.data, before, after });
  revalidatePath("/crm/contacts");
  revalidatePath(`/crm/contacts/${contactId.data}`);
  return { message: "Contact saved." };
}

/** Creates a contact from a lead's details (or links an existing one with the same email). */
export async function contactFromLeadAction(formData: FormData) {
  const { user, denied } = await guardAction("contacts", "create");
  if (denied) return;
  const leadId = uuid.safeParse(formData.get("lead_id"));
  if (!leadId.success) return;
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("id, full_name, email, phone, company, owner_id, source, contact_id").eq("id", leadId.data).maybeSingle();
  if (!lead || lead.contact_id) return;
  let contactId: string | null = null;
  if (lead.email) {
    const { data: existing } = await supabase.from("contacts").select("id").eq("email", lead.email).maybeSingle();
    contactId = existing?.id ?? null;
  }
  if (!contactId) {
    const owner = permissionScope(user.grants, "contacts", "create") === "own" ? user.id : (lead.owner_id ?? user.id);
    const { data, error } = await supabase
      .from("contacts")
      .insert({ full_name: lead.full_name, email: lead.email, phone: lead.phone, company: lead.company, source: lead.source, owner_id: owner, created_by: user.id })
      .select("id")
      .single();
    if (error) return;
    contactId = data.id;
    await writeAudit({ actorId: user.id, action: "contact.created", entityType: "contact", entityId: contactId, after: { from_lead: lead.id } });
  }
  await supabase.from("leads").update({ contact_id: contactId }).eq("id", lead.id);
  revalidatePath(`/crm/leads/${lead.id}`);
  redirect(`/crm/contacts/${contactId}`);
}

export async function deleteContactAction(formData: FormData) {
  const { user, denied } = await guardAction("contacts", "delete");
  if (denied) return;
  const contactId = uuid.safeParse(formData.get("id"));
  if (!contactId.success) return;
  const supabase = await createClient();
  const { data: before } = await supabase.from("contacts").select("*").eq("id", contactId.data).maybeSingle();
  if (!before) return;
  const { error } = await supabase.from("contacts").delete().eq("id", contactId.data);
  if (error) return;
  await writeAudit({ actorId: user.id, action: "contact.deleted", entityType: "contact", entityId: contactId.data, before });
  revalidatePath("/crm/contacts");
  redirect("/crm/contacts?notice=deleted");
}

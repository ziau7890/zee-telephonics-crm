"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guardAction } from "@/lib/auth/session";
import { writeAudit } from "@/lib/auth/security";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";

const serviceSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens, like the website uses"),
  title: z.string().trim().min(2, "Enter a name").max(120),
  sort_order: z.coerce.number().int().min(0).max(9999).default(100),
});

export async function addServiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, denied } = await guardAction("settings", "edit");
  if (denied) return denied;
  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("services").insert(parsed.data);
  if (error) return error.code === "23505" ? { fields: { slug: "That code is already used" } } : { error: "Could not add the service." };
  await writeAudit({ actorId: user.id, action: "service.created", entityType: "service", entityId: parsed.data.slug, after: parsed.data });
  revalidatePath("/crm/settings");
  return { message: "Service added." };
}

export async function updateServiceAction(formData: FormData) {
  const { user, denied } = await guardAction("settings", "edit");
  if (denied) return;
  const parsed = z
    .object({ slug: z.string(), title: z.string().trim().min(2).max(120), active: z.enum(["true", "false"]) })
    .safeParse({ slug: formData.get("slug"), title: formData.get("title"), active: formData.getAll("active").at(-1) });
  if (!parsed.success) return;
  const supabase = await createClient();
  const after = { title: parsed.data.title, active: parsed.data.active === "true" };
  const { error } = await supabase.from("services").update(after).eq("slug", parsed.data.slug);
  if (!error) await writeAudit({ actorId: user.id, action: "service.updated", entityType: "service", entityId: parsed.data.slug, after });
  revalidatePath("/crm/settings");
}

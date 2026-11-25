"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, timezoneSchema } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  phone: z.string().trim().max(40).regex(/^[+()\d\s-]*$/, "Use digits, spaces, +, - or brackets only"),
  timezone: timezoneSchema,
});

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };

  const supabase = await createClient();
  // RLS limits this to the user's own row; a trigger blocks changes to status, email and role fields.
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone || null, timezone: parsed.data.timezone })
    .eq("id", user.id);
  if (error) return { error: "Could not save your changes. Please try again." };
  revalidatePath("/crm", "layout");
  return { message: "Your profile was saved." };
}

/** Remembers the CRM theme choice (light, dark or follow the device). */
export async function setThemeAction(theme: string) {
  const value = theme === "light" || theme === "dark" ? theme : "system";
  (await cookies()).set("zt-theme", value, { path: "/crm", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure: process.env.NODE_ENV === "production", httpOnly: true });
}

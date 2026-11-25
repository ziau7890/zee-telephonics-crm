import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface Option {
  id: string;
  name: string;
}

/** Active staff, for "assigned to" pickers. */
export const getStaffOptions = cache(async (): Promise<Option[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name, email").eq("status", "active").order("full_name");
  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email }));
});

export interface Service {
  slug: string;
  title: string;
  active: boolean;
}

export const getServices = cache(async (): Promise<Service[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("services").select("slug, title, active").order("sort_order").order("title");
  return data ?? [];
});

/** Title for a service slug; unknown slugs are shown as given. */
export function serviceTitle(services: Service[], slug: string | null | undefined) {
  if (!slug) return null;
  return services.find((s) => s.slug === slug)?.title ?? slug;
}

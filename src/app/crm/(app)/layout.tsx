import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CrmSidebar } from "@/components/crm/sidebar";
import { SearchBox, ThemeToggle, UserChip, type ThemeChoice } from "@/components/crm/topbar";
import { requireUser } from "@/lib/auth/session";
import { can, visibleNav } from "@/lib/auth/permissions";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { default: "Workspace", template: "%s | Zee Telephonics CRM" },
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <div className="max-w-lg space-y-3 rounded-3xl border border-border bg-surface p-8 shadow-soft">
          <h1 className="font-display text-2xl font-bold">The CRM is not connected yet</h1>
          <p className="text-muted">Add the Supabase environment variables described in the README, run the database migrations, and invite the first Super Admin.</p>
        </div>
      </main>
    );
  }
  const user = await requireUser();
  const themeCookie = (await cookies()).get("zt-theme")?.value;
  const theme: ThemeChoice = themeCookie === "light" || themeCookie === "dark" ? themeCookie : "system";

  // Badge: the signed-in person's open follow-ups that are already due.
  let due = 0;
  if (can(user.grants, "follow_ups", "view")) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("follow_ups")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", user.id)
      .eq("status", "open")
      .lte("due_at", new Date().toISOString());
    due = count ?? 0;
  }

  return (
    <div id="crm-shell" data-theme={theme === "system" ? undefined : theme} className="crm-shell min-h-dvh lg:flex lg:gap-5 lg:p-3">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-surface focus:px-4 focus:py-2">
        Skip to content
      </a>
      <CrmSidebar items={visibleNav(user.grants)} badges={{ "/crm/follow-ups": due }} />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 px-4 pt-4 pl-18 sm:flex-nowrap sm:px-6 lg:px-0 lg:pt-0">
          <SearchBox />
          <div className="crm-glass ml-auto flex h-12 items-center gap-1 rounded-2xl px-1.5 shadow-soft">
            <ThemeToggle initial={theme} />
            <UserChip name={user.fullName} role={user.roles.map((r) => r.name).join(", ")} />
          </div>
        </header>
        <main id="main" className="px-4 py-6 sm:px-6 lg:px-1 lg:py-6">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

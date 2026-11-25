import Link from "next/link";
import { PageHeader, Panel, Tabs } from "@/components/crm/ui";
import { FOLLOW_UP_SELECT, FollowUpList, type FollowUpRow } from "@/components/crm/follow-up-list";
import { requirePagePermission } from "@/lib/auth/session";
import { can, permissionScope } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { dayKey } from "@/lib/crm/leads";
import { localInputToUtc } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Follow-ups" };

const VIEWS = { due: "Due now", upcoming: "Upcoming", done: "Done and cancelled" } as const;
type View = keyof typeof VIEWS;

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ view?: string; who?: string }> }) {
  const sp = await searchParams;
  const view: View = sp.view && sp.view in VIEWS ? (sp.view as View) : "due";
  const user = await requirePagePermission("follow_ups", "view");
  const scope = permissionScope(user.grants, "follow_ups", "view");
  const who = scope !== "own" && sp.who === "all" ? "all" : "me";
  const supabase = await createClient();

  // "Due now" = anything open that is overdue or due before the end of today (viewer's time zone).
  const tomorrow = dayKey(new Date(Date.now() + 864e5), user.timezone);
  const endOfToday = localInputToUtc(`${tomorrow}T00:00`, user.timezone) ?? new Date().toISOString();

  let query = supabase.from("follow_ups").select(FOLLOW_UP_SELECT).limit(300);
  if (who === "me") query = query.eq("assigned_to", user.id);
  if (view === "due") query = query.eq("status", "open").lt("due_at", endOfToday).order("due_at");
  else if (view === "upcoming") query = query.eq("status", "open").gte("due_at", endOfToday).order("due_at");
  else query = query.neq("status", "open").order("updated_at", { ascending: false });
  const { data } = await query;
  const rows = (data ?? []) as unknown as FollowUpRow[];

  const href = (v: View, w = who) => `/crm/follow-ups?view=${v}${w === "all" ? "&who=all" : ""}`;
  const empty = {
    due: "Nothing is due. Follow-ups you schedule on a lead or contact appear here on the day they are due.",
    upcoming: "Nothing scheduled after today.",
    done: "No completed or cancelled follow-ups yet.",
  }[view];

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description="Scheduled calls, emails and meetings. Add new ones from a lead or contact page."
        actions={
          scope !== "own" ? (
            <nav aria-label="Whose follow-ups" className="flex gap-1 rounded-full border border-border bg-surface p-1 text-sm">
              {(["me", "all"] as const).map((w) => (
                <Link
                  key={w}
                  href={href(view, w)}
                  aria-current={w === who ? "page" : undefined}
                  className={cn("rounded-full px-3 py-1.5 font-medium", w === who ? "bg-navy text-white dark:bg-brand-cyan dark:text-navy" : "text-muted hover:text-foreground")}
                >
                  {w === "me" ? "Mine" : scope === "team" ? "My team" : "Everyone"}
                </Link>
              ))}
            </nav>
          ) : null
        }
      />
      <Tabs items={(Object.keys(VIEWS) as View[]).map((v) => ({ href: href(v), label: VIEWS[v] }))} active={href(view)} />
      <Panel>
        <FollowUpList rows={rows} timeZone={user.timezone} canEdit={can(user.grants, "follow_ups", "edit")} showParent empty={empty} />
      </Panel>
    </>
  );
}

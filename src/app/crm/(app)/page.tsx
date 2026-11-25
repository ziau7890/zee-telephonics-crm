import Link from "next/link";
import { CalendarClock, ChartColumn, Inbox, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { Badge, Notice } from "@/components/crm/ui";
import { FOLLOW_UP_SELECT, FollowUpList, type FollowUpRow } from "@/components/crm/follow-up-list";
import { requireUser } from "@/lib/auth/session";
import { can, permissionScope } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, localInputToUtc, timeZoneLabel } from "@/lib/format";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_STATUS_TONES, OPEN_LEAD_STATUSES, dayKey, type LeadStatus } from "@/lib/crm/leads";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

function Card({ title, icon: Icon, children, className, action }: { title: string; icon: typeof Inbox; children: React.ReactNode; className?: string; action?: { href: string; label: string } }) {
  return (
    <section className={cn("crm-glass rounded-[1.75rem] p-6 shadow-soft", className)}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-muted">
        <Icon className="size-4 text-accent-text" aria-hidden /> {title}
      </h2>
      <div className="mt-4">{children}</div>
      {action ? (
        <Link href={action.href} className="mt-4 inline-block text-sm font-medium text-accent-text hover:underline">
          {action.label}
        </Link>
      ) : null}
    </section>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: "danger" }) {
  return (
    <div>
      <p className={cn("font-display text-3xl font-bold tabular-nums", tone === "danger" && value ? "text-danger" : "")}>{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();
  const tz = user.timezone;
  const now = new Date();
  const since7 = new Date(now.getTime() - 7 * 864e5).toISOString();
  const endOfToday = localInputToUtc(`${dayKey(new Date(now.getTime() + 864e5), tz)}T00:00`, tz) ?? now.toISOString();

  const canLeads = can(user.grants, "leads", "view");
  const canFollowUps = can(user.grants, "follow_ups", "view");
  const leadScope = permissionScope(user.grants, "leads", "view");

  const [leads, recent, unassigned, myDue, logins] = await Promise.all([
    canLeads ? supabase.from("leads").select("status, created_at").limit(10000) : null,
    canLeads
      ? supabase.from("leads").select("id, full_name, company, status, source, created_at").order("created_at", { ascending: false }).limit(6)
      : null,
    canLeads && leadScope === "all" ? supabase.from("leads").select("id", { count: "exact", head: true }).is("owner_id", null).not("status", "in", "(won,lost)") : null,
    canFollowUps
      ? supabase.from("follow_ups").select(FOLLOW_UP_SELECT).eq("assigned_to", user.id).eq("status", "open").lt("due_at", endOfToday).order("due_at").limit(8)
      : null,
    supabase.from("login_events").select("result, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
  ]);

  const leadRows = (leads?.data ?? []) as { status: LeadStatus; created_at: string }[];
  const open = leadRows.filter((l) => OPEN_LEAD_STATUSES.includes(l.status)).length;
  const newThisWeek = leadRows.filter((l) => l.created_at >= since7).length;
  const pipeline = LEAD_STATUSES.map((s) => ({ stage: s, count: leadRows.filter((l) => l.status === s).length }));
  const pipelineMax = Math.max(1, ...pipeline.map((p) => p.count));
  const dueRows = (myDue?.data ?? []) as unknown as FollowUpRow[];
  const overdue = dueRows.filter((f) => f.due_at < now.toISOString()).length;
  const today = formatDateTime(now.toISOString(), tz, { dateStyle: "full", timeStyle: undefined });

  return (
    <div className="space-y-8">
      {notice === "password-updated" ? <Notice>Your password was updated and your other sessions were signed out.</Notice> : null}
      {notice === "forbidden" ? <Notice tone="error">You do not have access to that page. Ask an administrator if you need it.</Notice> : null}
      <header className="space-y-1">
        <p className="text-sm text-muted">
          {today} · {timeZoneLabel(tz)}
        </p>
        <h1 className="font-display text-3xl font-bold text-navy dark:text-white">Welcome{user.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}</h1>
      </header>

      {!user.roles.length ? (
        <Notice tone="error">No role is assigned to your account yet, so there is nothing to show. Ask an administrator to give you a role.</Notice>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {canFollowUps ? (
          <Card title="Your follow-ups due today" icon={CalendarClock} className="md:col-span-2" action={{ href: "/crm/follow-ups", label: "All follow-ups" }}>
            <div className="mb-4 flex gap-8">
              <Stat value={dueRows.length} label="Due by end of today" />
              <Stat value={overdue} label="Overdue" tone="danger" />
            </div>
            <FollowUpList rows={dueRows} timeZone={tz} canEdit={can(user.grants, "follow_ups", "edit")} showParent empty="You're all caught up." />
          </Card>
        ) : null}

        {canLeads ? (
          <Card title={leadScope === "all" ? "Leads" : leadScope === "team" ? "Your team's leads" : "Your leads"} icon={Inbox} action={{ href: "/crm/leads?status=open", label: "Open leads" }}>
            <div className="grid grid-cols-2 gap-4">
              <Stat value={open} label="Open" />
              <Stat value={newThisWeek} label="New in 7 days" />
            </div>
            {unassigned?.count ? (
              <Link href="/crm/leads?owner=none" className="mt-4 flex items-center justify-between rounded-2xl bg-warning-surface px-4 py-3 text-sm font-medium text-warning">
                {unassigned.count} open {unassigned.count === 1 ? "lead needs" : "leads need"} an owner
                <span aria-hidden>→</span>
              </Link>
            ) : null}
          </Card>
        ) : null}

        {canLeads ? (
          <Card title="Pipeline (current status)" icon={ChartColumn} className="md:col-span-2 xl:col-span-2">
            {leadRows.length ? (
              <ul className="space-y-2.5">
                {pipeline.map((p) => (
                  <li key={p.stage} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3 text-sm">
                    <Link href={`/crm/leads?status=${p.stage}`} className="hover:text-accent-text hover:underline">
                      {LEAD_STATUS_LABELS[p.stage]}
                    </Link>
                    <span className="h-2.5 rounded-full bg-surface-muted">
                      <span className="block h-full rounded-full bg-gradient-to-r from-brand-blue to-brand-cyan" style={{ width: `${(p.count / pipelineMax) * 100}%` }} />
                    </span>
                    <span className="text-right font-medium tabular-nums">{p.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No leads yet. Website enquiries appear here as they arrive.</p>
            )}
          </Card>
        ) : null}

        {canLeads ? (
          <Card title="Newest leads" icon={Sparkles} action={{ href: "/crm/leads", label: "All leads" }}>
            {recent?.data?.length ? (
              <ul className="space-y-3 text-sm">
                {recent.data.map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <Link href={`/crm/leads/${l.id}`} className="block truncate font-medium hover:text-accent-text hover:underline">
                        {l.full_name}
                      </Link>
                      <span className="block truncate text-xs text-muted">
                        {[l.company, l.source === "website" ? "Website" : null, formatDateTime(l.created_at, tz, { dateStyle: "medium", timeStyle: undefined })].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <Badge tone={LEAD_STATUS_TONES[l.status as LeadStatus]}>{LEAD_STATUS_LABELS[l.status as LeadStatus]}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nothing yet.</p>
            )}
          </Card>
        ) : null}

        <Card title="Your access" icon={ShieldCheck}>
          {user.roles.length ? (
            <ul className="flex flex-wrap gap-2">
              {user.roles.map((r) => (
                <li key={r.key}>
                  <Badge tone="navy">{r.name}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No role yet.</p>
          )}
        </Card>
        <Card title="Your recent sign-ins" icon={KeyRound} action={{ href: "/crm/account", label: "Account and sign-in history" }}>
          {logins.data?.length ? (
            <ul className="space-y-2 text-sm">
              {logins.data.map((l) => (
                <li key={l.created_at} className="flex justify-between gap-3">
                  <span className="capitalize">{l.result.replace(/_/g, " ")}</span>
                  <span className="text-muted">{formatDateTime(l.created_at, tz)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No activity recorded yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

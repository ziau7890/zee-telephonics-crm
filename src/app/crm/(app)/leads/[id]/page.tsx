import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, MessageCircle, Phone, UserPlus } from "lucide-react";
import { Badge, DangerZone, DetailRow, PageHeader, Panel } from "@/components/crm/ui";
import { Button } from "@/components/ui/button";
import { ActivityForm, FollowUpForm, LeadDetailsForm, LeadStatusForm } from "@/components/crm/record-forms";
import { FOLLOW_UP_SELECT, FollowUpList, type FollowUpRow } from "@/components/crm/follow-up-list";
import { requirePagePermission } from "@/lib/auth/session";
import { can, permissionScope } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { getServices, getStaffOptions, serviceTitle } from "@/lib/crm/server";
import {
  ACTIVITY_LABELS,
  CALL_OUTCOME_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_TONES,
  SOURCE_LABELS,
  defaultDueInput,
  formatDuration,
  phoneDigits,
  type CallOutcome,
  type LeadStatus,
  type Source,
} from "@/lib/crm/leads";
import { deleteLeadAction } from "../actions";
import { contactFromLeadAction } from "../../contacts/actions";

export const metadata = { title: "Lead" };

interface Activity {
  id: string;
  kind: string;
  body: string | null;
  call_outcome: CallOutcome | null;
  call_seconds: number | null;
  meta: Record<string, string | null> | null;
  created_at: string;
  author: { full_name: string; email: string } | null;
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requirePagePermission("leads", "view");
  const supabase = await createClient();
  const canEdit = can(user.grants, "leads", "edit");
  const canAssign = ["all", "team"].includes(permissionScope(user.grants, "leads", "edit") ?? "");
  const canFollowUp = can(user.grants, "follow_ups", "create");
  const canAssignFollowUp = permissionScope(user.grants, "follow_ups", "create") !== "own";

  const [{ data: lead }, { data: activities }, { data: followUps }, services, people] = await Promise.all([
    supabase.from("leads").select("*, owner:profiles!leads_owner_id_fkey(full_name, email), contact:contacts(id, full_name)").eq("id", id).maybeSingle(),
    supabase.from("lead_activities").select("id, kind, body, call_outcome, call_seconds, meta, created_at, author:profiles!lead_activities_author_id_fkey(full_name, email)").eq("lead_id", id).order("created_at", { ascending: false }).limit(200),
    can(user.grants, "follow_ups", "view") ? supabase.from("follow_ups").select(FOLLOW_UP_SELECT).eq("lead_id", id).order("status").order("due_at") : Promise.resolve({ data: [] }),
    getServices(),
    canAssign || canAssignFollowUp ? getStaffOptions() : Promise.resolve([]),
  ]);
  if (!lead) notFound();
  const names = new Map(people.map((p) => [p.id, p.name]));
  const digits = phoneDigits(lead.phone);
  const status = lead.status as LeadStatus;
  const owner = lead.owner as { full_name: string; email: string } | null;
  const contact = lead.contact as { id: string; full_name: string } | null;
  const timeline = (activities ?? []) as unknown as Activity[];

  function describe(a: Activity) {
    if (a.kind === "status_change") {
      const from = LEAD_STATUS_LABELS[a.meta?.from as LeadStatus] ?? a.meta?.from;
      const to = LEAD_STATUS_LABELS[a.meta?.to as LeadStatus] ?? a.meta?.to;
      return `${from} → ${to}${a.meta?.lost_reason ? `: ${a.meta.lost_reason}` : ""}`;
    }
    if (a.kind === "assignment") {
      const to = a.meta?.to ? (names.get(a.meta.to) ?? "another person") : "nobody";
      return `Assigned to ${to}`;
    }
    if (a.kind === "created") return a.meta?.source === "website" ? "Arrived through the website contact form" : "Added to the CRM";
    return null;
  }

  return (
    <>
      <PageHeader
        title={lead.full_name}
        description={`${lead.company ? `${lead.company} · ` : ""}received ${formatDateTime(lead.created_at, user.timezone)}`}
        back={{ href: "/crm/leads", label: "Leads" }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={LEAD_STATUS_TONES[status]}>{LEAD_STATUS_LABELS[status]}</Badge>
            {lead.priority === "high" ? <Badge tone="red">High priority</Badge> : null}
            {owner ? <Badge tone="navy">{owner.full_name || owner.email}</Badge> : <Badge tone="amber">Unassigned</Badge>}
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Panel title="Their message">
            <p className="text-sm whitespace-pre-line">{lead.message || <span className="text-muted">No message was written.</span>}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {lead.email ? (
                <a href={`mailto:${lead.email}`} className="inline-flex h-10 items-center gap-2 rounded-full bg-navy px-4 text-sm font-semibold text-white dark:bg-brand-cyan dark:text-navy">
                  <Mail className="size-4" aria-hidden /> Email
                </a>
              ) : null}
              {digits ? (
                <>
                  <a href={`tel:+${digits}`} className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold">
                    <Phone className="size-4" aria-hidden /> Call
                  </a>
                  <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold">
                    <MessageCircle className="size-4" aria-hidden /> WhatsApp
                  </a>
                </>
              ) : null}
            </div>
          </Panel>

          {canEdit ? (
            <Panel title="Log a call or add a note">
              <ActivityForm leadId={lead.id} />
            </Panel>
          ) : null}

          <Panel title="Timeline">
            {timeline.length ? (
              <ol className="relative space-y-5 border-l border-border pl-5">
                {timeline.map((a) => (
                  <li key={a.id} className="relative">
                    <span aria-hidden className={`absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full ${a.kind === "call" ? "bg-brand-blue" : a.kind === "status_change" || a.kind === "assignment" || a.kind === "created" ? "bg-muted/50" : "bg-brand-cyan"}`} />
                    <p className="text-sm">
                      <span className="font-semibold">{ACTIVITY_LABELS[a.kind] ?? a.kind}</span>
                      {a.call_outcome ? <span> · {CALL_OUTCOME_LABELS[a.call_outcome]}</span> : null}
                      {a.call_seconds !== null ? <span className="text-muted"> · {formatDuration(a.call_seconds)}</span> : null}
                    </p>
                    {describe(a) ? <p className="text-sm text-muted">{describe(a)}</p> : null}
                    {a.body ? <p className="mt-1 text-sm whitespace-pre-line">{a.body}</p> : null}
                    <p className="mt-1 text-xs text-muted">
                      {a.author ? a.author.full_name || a.author.email : "System"} · {formatDateTime(a.created_at, user.timezone)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">Nothing recorded yet.</p>
            )}
          </Panel>

          <Panel title="Details">
            {canEdit ? (
              <LeadDetailsForm lead={lead} services={services} />
            ) : (
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <DetailRow label="Email">{lead.email}</DetailRow>
                <DetailRow label="Phone">{lead.phone}</DetailRow>
                <DetailRow label="Company">{lead.company}</DetailRow>
                <DetailRow label="Service">{serviceTitle(services, lead.service_interest)}</DetailRow>
              </dl>
            )}
            <dl className="mt-6 grid gap-4 border-t border-border pt-5 text-sm sm:grid-cols-2">
              <DetailRow label="Source">{SOURCE_LABELS[lead.source as Source] ?? lead.source}</DetailRow>
              <DetailRow label="Team size">{lead.team_size}</DetailRow>
              <DetailRow label="Page they sent it from">{lead.source_page}</DetailRow>
              <DetailRow label="Campaign">{[lead.utm_source, lead.utm_medium, lead.utm_campaign, lead.utm_term, lead.utm_content].filter(Boolean).join(" / ")}</DetailRow>
              <DetailRow label="Consent">{lead.consent_at ? `${lead.consent_text ?? "Given"} (${formatDateTime(lead.consent_at, user.timezone)})` : null}</DetailRow>
              {lead.won_at ? <DetailRow label="Won on">{formatDateTime(lead.won_at, user.timezone)}</DetailRow> : null}
            </dl>
          </Panel>
        </div>

        <div className="space-y-6">
          {canEdit ? (
            <Panel title="Status and owner">
              <LeadStatusForm id={lead.id} status={lead.status} priority={lead.priority} ownerId={lead.owner_id} lostReason={lead.lost_reason} people={people} canAssign={canAssign} />
            </Panel>
          ) : null}

          {can(user.grants, "follow_ups", "view") ? (
            <Panel title="Follow-ups">
              <FollowUpList rows={(followUps ?? []) as unknown as FollowUpRow[]} timeZone={user.timezone} canEdit={can(user.grants, "follow_ups", "edit")} empty="No follow-ups yet. Schedule the next step below so it isn't forgotten." />
              {canFollowUp ? (
                <div className="mt-5 border-t border-border pt-5">
                  <FollowUpForm leadId={lead.id} people={people} canAssign={canAssignFollowUp} defaultDue={defaultDueInput(new Date(), user.timezone)} />
                </div>
              ) : null}
            </Panel>
          ) : null}

          <Panel title="Contact">
            {contact ? (
              <p className="text-sm">
                Linked to{" "}
                <Link href={`/crm/contacts/${contact.id}`} className="font-semibold text-accent-text hover:underline">
                  {contact.full_name}
                </Link>
                .
              </p>
            ) : can(user.grants, "contacts", "create") ? (
              <form action={contactFromLeadAction} className="space-y-3">
                <p className="text-sm text-muted">Not linked to a contact yet. Save this person as a contact to keep their details and history together.</p>
                <input type="hidden" name="lead_id" value={lead.id} />
                <Button type="submit" variant="outline" size="sm">
                  <UserPlus className="size-4" aria-hidden /> Save as contact
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted">Not linked to a contact.</p>
            )}
          </Panel>

          {can(user.grants, "leads", "delete") ? (
            <DangerZone
              label="Delete this lead"
              confirmLabel="Yes, delete it"
              note="This removes the lead, its timeline and its follow-ups. The audit log keeps a copy of the lead's details."
              action={deleteLeadAction}
              fields={{ id: lead.id }}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}

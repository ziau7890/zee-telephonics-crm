import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, MessageCircle, Phone, Plus } from "lucide-react";
import { Badge, DangerZone, PageHeader, Panel } from "@/components/crm/ui";
import { ButtonLink } from "@/components/ui/button";
import { ContactForm, FollowUpForm } from "@/components/crm/record-forms";
import { FOLLOW_UP_SELECT, FollowUpList, type FollowUpRow } from "@/components/crm/follow-up-list";
import { requirePagePermission } from "@/lib/auth/session";
import { can, permissionScope } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { getServices, getStaffOptions, serviceTitle } from "@/lib/crm/server";
import { LEAD_STATUS_LABELS, LEAD_STATUS_TONES, SOURCE_LABELS, defaultDueInput, phoneDigits, type LeadStatus, type Source } from "@/lib/crm/leads";
import { deleteContactAction } from "../actions";

export const metadata = { title: "Contact" };

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requirePagePermission("contacts", "view");
  const canEdit = can(user.grants, "contacts", "edit");
  const canAssign = ["all", "team"].includes(permissionScope(user.grants, "contacts", "edit") ?? "");
  const canAssignFollowUp = permissionScope(user.grants, "follow_ups", "create") !== "own";
  const supabase = await createClient();
  const [{ data: contact }, { data: leads }, { data: followUps }, services, people] = await Promise.all([
    supabase.from("contacts").select("*, owner:profiles!contacts_owner_id_fkey(full_name, email)").eq("id", id).maybeSingle(),
    can(user.grants, "leads", "view")
      ? supabase.from("leads").select("id, full_name, status, service_interest, created_at").eq("contact_id", id).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    can(user.grants, "follow_ups", "view") ? supabase.from("follow_ups").select(FOLLOW_UP_SELECT).eq("contact_id", id).order("status").order("due_at") : Promise.resolve({ data: [] }),
    getServices(),
    canAssign || canAssignFollowUp ? getStaffOptions() : Promise.resolve([]),
  ]);
  if (!contact) notFound();
  const digits = phoneDigits(contact.phone);
  const owner = contact.owner as { full_name: string; email: string } | null;

  return (
    <>
      <PageHeader
        title={contact.full_name}
        description={[contact.job_title, contact.company].filter(Boolean).join(", ") || `Added ${formatDateTime(contact.created_at, user.timezone, { dateStyle: "medium", timeStyle: undefined })}`}
        back={{ href: "/crm/contacts", label: "Contacts" }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="navy">{SOURCE_LABELS[contact.source as Source] ?? contact.source}</Badge>
            {owner ? <Badge tone="cyan">Owner: {owner.full_name || owner.email}</Badge> : null}
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Panel>
            <div className="flex flex-wrap gap-2">
              {contact.email ? (
                <a href={`mailto:${contact.email}`} className="inline-flex h-10 items-center gap-2 rounded-full bg-navy px-4 text-sm font-semibold text-white dark:bg-brand-cyan dark:text-navy">
                  <Mail className="size-4" aria-hidden /> {contact.email}
                </a>
              ) : null}
              {digits ? (
                <>
                  <a href={`tel:+${digits}`} className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold">
                    <Phone className="size-4" aria-hidden /> {contact.phone}
                  </a>
                  <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold">
                    <MessageCircle className="size-4" aria-hidden /> WhatsApp
                  </a>
                </>
              ) : null}
              {!contact.email && !digits ? <p className="text-sm text-muted">No email or phone saved yet.</p> : null}
            </div>
          </Panel>
          <Panel title="Leads">
            {leads?.length ? (
              <ul className="divide-y divide-border/70">
                {leads.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <Link href={`/crm/leads/${l.id}`} className="font-medium hover:text-accent-text hover:underline">
                        {serviceTitle(services, l.service_interest) ?? "General enquiry"}
                      </Link>
                      <span className="block text-xs text-muted">{formatDateTime(l.created_at, user.timezone, { dateStyle: "medium", timeStyle: undefined })}</span>
                    </span>
                    <Badge tone={LEAD_STATUS_TONES[l.status as LeadStatus]}>{LEAD_STATUS_LABELS[l.status as LeadStatus]}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No leads you can see for this contact.</p>
            )}
            {can(user.grants, "leads", "create") ? (
              <ButtonLink href={`/crm/leads/new?contact=${contact.id}`} variant="outline" size="sm" className="mt-4">
                <Plus className="size-4" aria-hidden /> New lead for this contact
              </ButtonLink>
            ) : null}
          </Panel>
          <Panel title={canEdit ? "Edit contact" : "Notes"}>
            {canEdit ? (
              <ContactForm contact={contact} people={people} canAssign={canAssign} />
            ) : (
              <p className="text-sm whitespace-pre-line">{contact.notes || <span className="text-muted">No notes.</span>}</p>
            )}
          </Panel>
        </div>
        <div className="space-y-6">
          {can(user.grants, "follow_ups", "view") ? (
            <Panel title="Follow-ups">
              <FollowUpList rows={(followUps ?? []) as unknown as FollowUpRow[]} timeZone={user.timezone} canEdit={can(user.grants, "follow_ups", "edit")} empty="No follow-ups for this contact." />
              {can(user.grants, "follow_ups", "create") ? (
                <div className="mt-5 border-t border-border pt-5">
                  <FollowUpForm contactId={contact.id} people={people} canAssign={canAssignFollowUp} defaultDue={defaultDueInput(new Date(), user.timezone)} />
                </div>
              ) : null}
            </Panel>
          ) : null}
          {can(user.grants, "contacts", "delete") ? (
            <DangerZone
              label="Delete this contact"
              confirmLabel="Yes, delete it"
              note="Their leads stay but are no longer linked. Follow-ups on the contact itself are removed. The audit log keeps a copy."
              action={deleteContactAction}
              fields={{ id: contact.id }}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}

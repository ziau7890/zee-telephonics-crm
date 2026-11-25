"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { StateAlerts, SubmitButton } from "@/components/crm/form-bits";
import { initialFormState, type FormState } from "@/lib/form-state";
import {
  ACTIVITY_KINDS,
  ACTIVITY_LABELS,
  CALL_OUTCOMES,
  CALL_OUTCOME_LABELS,
  FOLLOW_UP_KINDS,
  FOLLOW_UP_KIND_LABELS,
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  SOURCES,
  SOURCE_LABELS,
} from "@/lib/crm/leads";
import { addActivityAction, createLeadAction, updateLeadDetailsAction, updateLeadStatusAction } from "@/app/crm/(app)/leads/actions";
import { createFollowUpAction } from "@/app/crm/(app)/follow-ups/actions";
import { createContactAction, updateContactAction } from "@/app/crm/(app)/contacts/actions";

type Option = { id: string; name: string };
type ServiceOption = { slug: string; title: string; active: boolean };

/** Resets a form after a successful save (state.message set). */
function useResetOnSuccess(state: FormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.message) ref.current?.reset();
  }, [state]);
  return ref;
}

function TextField({ label, name, state, defaultValue, type = "text", required, hint, autoComplete }: { label: string; name: string; state: FormState; defaultValue?: string | null; type?: string; required?: boolean; hint?: string; autoComplete?: string }) {
  return (
    <Field label={label} name={name} error={state.fields?.[name]} required={required} hint={hint}>
      {(p) => <Input id={p.id} name={name} type={type} defaultValue={defaultValue ?? ""} required={required} autoComplete={autoComplete} aria-describedby={p.describedBy} aria-invalid={p.invalid} />}
    </Field>
  );
}

function PersonSelect({ label, name, people, defaultValue, state, emptyLabel = "Nobody yet" }: { label: string; name: string; people: Option[]; defaultValue?: string | null; state: FormState; emptyLabel?: string }) {
  return (
    <Field label={label} name={name} error={state.fields?.[name]}>
      {(p) => (
        <Select id={p.id} name={name} defaultValue={defaultValue ?? ""} aria-describedby={p.describedBy} aria-invalid={p.invalid}>
          <option value="">{emptyLabel}</option>
          {people.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function ServiceSelect({ services, defaultValue, state }: { services: ServiceOption[]; defaultValue?: string | null; state: FormState }) {
  const known = services.some((s) => s.slug === defaultValue);
  return (
    <Field label="Service they're interested in" name="service_interest" error={state.fields?.service_interest}>
      {(p) => (
        <Select id={p.id} name="service_interest" defaultValue={defaultValue ?? ""} aria-describedby={p.describedBy}>
          <option value="">Not given</option>
          {services
            .filter((s) => s.active || s.slug === defaultValue)
            .map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.title}
              </option>
            ))}
          {defaultValue && !known ? <option value={defaultValue}>{defaultValue}</option> : null}
        </Select>
      )}
    </Field>
  );
}

function SourceSelect({ defaultValue, state }: { defaultValue?: string | null; state: FormState }) {
  return (
    <Field label="Where it came from" name="source" error={state.fields?.source}>
      {(p) => (
        <Select id={p.id} name="source" defaultValue={defaultValue ?? "manual"}>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s]}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------
export interface LeadDetails {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  service_interest: string | null;
  message: string | null;
  source: string;
}

export function LeadCreateForm({ services, people, canAssign, defaults }: { services: ServiceOption[]; people: Option[]; canAssign: boolean; defaults?: { contact_id?: string; full_name?: string; email?: string; phone?: string; company?: string } }) {
  const [state, action] = useActionState(createLeadAction, initialFormState);
  return (
    <form action={action} className="space-y-5" noValidate>
      <StateAlerts state={state} />
      {defaults?.contact_id ? <input type="hidden" name="contact_id" value={defaults.contact_id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" name="full_name" state={state} defaultValue={defaults?.full_name} required />
        <TextField label="Company" name="company" state={state} defaultValue={defaults?.company} />
        <TextField label="Email" name="email" type="email" state={state} defaultValue={defaults?.email} hint="Add an email or a phone number." />
        <TextField label="Phone" name="phone" type="tel" state={state} defaultValue={defaults?.phone} />
        <ServiceSelect services={services} state={state} />
        <SourceSelect state={state} />
        <Field label="Status" name="status" error={state.fields?.status}>
          {(p) => (
            <Select id={p.id} name="status" defaultValue="new">
              {LEAD_STATUSES.filter((s) => s !== "won" && s !== "lost").map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Priority" name="priority">
          {(p) => (
            <Select id={p.id} name="priority" defaultValue="medium" className="capitalize">
              {LEAD_PRIORITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {canAssign ? <PersonSelect label="Assigned to" name="owner_id" people={people} state={state} emptyLabel="Me" /> : null}
      </div>
      <Field label="What do they need?" name="message" error={state.fields?.message}>
        {(p) => <Textarea id={p.id} name="message" aria-describedby={p.describedBy} />}
      </Field>
      <SubmitButton>Save lead</SubmitButton>
    </form>
  );
}

export function LeadDetailsForm({ lead, services }: { lead: LeadDetails; services: ServiceOption[] }) {
  const [state, action] = useActionState(updateLeadDetailsAction, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <StateAlerts state={state} />
      <input type="hidden" name="id" value={lead.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" name="full_name" state={state} defaultValue={lead.full_name} required />
        <TextField label="Company" name="company" state={state} defaultValue={lead.company} />
        <TextField label="Email" name="email" type="email" state={state} defaultValue={lead.email} />
        <TextField label="Phone" name="phone" type="tel" state={state} defaultValue={lead.phone} />
        <ServiceSelect services={services} state={state} defaultValue={lead.service_interest} />
        <SourceSelect state={state} defaultValue={lead.source} />
      </div>
      <Field label="Their message or needs" name="message" error={state.fields?.message}>
        {(p) => <Textarea id={p.id} name="message" defaultValue={lead.message ?? ""} />}
      </Field>
      <SubmitButton variant="outline">Save details</SubmitButton>
    </form>
  );
}

export function LeadStatusForm({ id, status, priority, ownerId, lostReason, people, canAssign }: { id: string; status: string; priority: string; ownerId: string | null; lostReason: string | null; people: Option[]; canAssign: boolean }) {
  const [state, action] = useActionState(updateLeadStatusAction, initialFormState);
  const [current, setCurrent] = useState(status);
  return (
    <form action={action} className="space-y-4">
      <StateAlerts state={state} />
      <input type="hidden" name="id" value={id} />
      <Field label="Status" name="status" error={state.fields?.status}>
        {(p) => (
          <Select id={p.id} name="status" defaultValue={status} onChange={(e) => setCurrent(e.target.value)}>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {current === "lost" ? <TextField label="Why was it lost?" name="lost_reason" state={state} defaultValue={lostReason} required /> : null}
      <Field label="Priority" name="priority" error={state.fields?.priority}>
        {(p) => (
          <Select id={p.id} name="priority" defaultValue={priority} className="capitalize">
            {LEAD_PRIORITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {canAssign ? (
        <PersonSelect label="Assigned to" name="owner_id" people={people} defaultValue={ownerId} state={state} />
      ) : (
        <input type="hidden" name="owner_id" value={ownerId ?? ""} />
      )}
      <SubmitButton>Save</SubmitButton>
    </form>
  );
}

export function ActivityForm({ leadId }: { leadId: string }) {
  const [state, action] = useActionState(addActivityAction, initialFormState);
  const ref = useResetOnSuccess(state);
  const [kind, setKind] = useState<string>("call");
  return (
    <form ref={ref} action={action} className="space-y-4" noValidate onReset={() => setKind("call")}>
      <StateAlerts state={state} />
      <input type="hidden" name="lead_id" value={leadId} />
      <fieldset>
        <legend className="mb-2 text-sm font-medium">What happened?</legend>
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_KINDS.map((k) => (
            <label key={k} className="cursor-pointer">
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="peer sr-only" />
              <span className="inline-flex h-9 items-center rounded-full border border-border bg-surface px-4 text-sm font-medium peer-checked:border-navy peer-checked:bg-navy peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-ring dark:peer-checked:border-brand-cyan dark:peer-checked:bg-brand-cyan dark:peer-checked:text-navy">
                {ACTIVITY_LABELS[k]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {kind === "call" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Call outcome" name="call_outcome" error={state.fields?.call_outcome} required>
            {(p) => (
              <Select id={p.id} name="call_outcome" defaultValue="" aria-invalid={p.invalid} aria-describedby={p.describedBy}>
                <option value="" disabled>
                  Choose one
                </option>
                {CALL_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {CALL_OUTCOME_LABELS[o]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Length (minutes)" name="call_minutes" error={state.fields?.call_minutes}>
            {(p) => <Input id={p.id} name="call_minutes" type="number" inputMode="decimal" min={0} max={600} step="0.5" aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
          </Field>
        </div>
      ) : null}
      <Field label={kind === "call" ? "Notes (optional)" : "Notes"} name="body" error={state.fields?.body}>
        {(p) => <Textarea id={p.id} name="body" className="min-h-24" aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
      </Field>
      <SubmitButton>{kind === "call" ? "Log call" : "Add to timeline"}</SubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------
export function FollowUpForm({ leadId, contactId, people, canAssign, defaultDue }: { leadId?: string; contactId?: string; people: Option[]; canAssign: boolean; defaultDue: string }) {
  const [state, action] = useActionState(createFollowUpAction, initialFormState);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="space-y-4" noValidate>
      <StateAlerts state={state} />
      {leadId ? <input type="hidden" name="lead_id" value={leadId} /> : null}
      {contactId ? <input type="hidden" name="contact_id" value={contactId} /> : null}
      <TextField label="What needs doing?" name="title" state={state} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" name="kind">
          {(p) => (
            <Select id={p.id} name="kind" defaultValue="call">
              {FOLLOW_UP_KINDS.map((k) => (
                <option key={k} value={k}>
                  {FOLLOW_UP_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Due" name="due_at" error={state.fields?.due_at} required hint="In your own time zone.">
          {(p) => <Input id={p.id} name="due_at" type="datetime-local" defaultValue={defaultDue} required aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
        </Field>
      </div>
      {canAssign ? <PersonSelect label="Who should do it?" name="assigned_to" people={people} state={state} emptyLabel="Me" /> : null}
      <Field label="Notes (optional)" name="notes" error={state.fields?.notes}>
        {(p) => <Textarea id={p.id} name="notes" className="min-h-20" />}
      </Field>
      <SubmitButton>Schedule follow-up</SubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------
export interface ContactValues {
  id?: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  notes: string | null;
  source: string;
  owner_id: string | null;
}

export function ContactForm({ contact, people, canAssign }: { contact?: ContactValues; people: Option[]; canAssign: boolean }) {
  const [state, action] = useActionState(contact?.id ? updateContactAction : createContactAction, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <StateAlerts state={state} />
      {contact?.id ? <input type="hidden" name="id" value={contact.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" name="full_name" state={state} defaultValue={contact?.full_name} required />
        <TextField label="Company" name="company" state={state} defaultValue={contact?.company} />
        <TextField label="Email" name="email" type="email" state={state} defaultValue={contact?.email} />
        <TextField label="Phone" name="phone" type="tel" state={state} defaultValue={contact?.phone} />
        <TextField label="Job title" name="job_title" state={state} defaultValue={contact?.job_title} />
        <SourceSelect state={state} defaultValue={contact?.source} />
        {canAssign ? <PersonSelect label="Owner" name="owner_id" people={people} defaultValue={contact?.owner_id} state={state} emptyLabel={contact?.id ? "Nobody" : "Me"} /> : null}
      </div>
      <Field label="Notes" name="notes" error={state.fields?.notes}>
        {(p) => <Textarea id={p.id} name="notes" defaultValue={contact?.notes ?? ""} className="min-h-24" />}
      </Field>
      <SubmitButton>{contact?.id ? "Save contact" : "Save contact"}</SubmitButton>
    </form>
  );
}

"use client";

import { useActionState, useEffect, useRef } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { StateAlerts, SubmitButton } from "@/components/crm/form-bits";
import { initialFormState } from "@/lib/form-state";
import { addTeamMemberAction, saveTeamAction } from "./actions";

type Option = { id: string; name: string };

export function TeamForm({ team, people }: { team?: { id: string; name: string; description: string | null; lead_id: string | null }; people: Option[] }) {
  const [state, action] = useActionState(saveTeamAction, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <StateAlerts state={state} />
      <input type="hidden" name="id" value={team?.id ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Team name" name="name" error={state.fields?.name} required>
          {(p) => <Input id={p.id} name="name" defaultValue={team?.name ?? ""} required aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
        </Field>
        <Field label="Team leader" name="lead_id" error={state.fields?.lead_id} hint="Give them the Team Leader role as well, in Users.">
          {(p) => (
            <Select id={p.id} name="lead_id" defaultValue={team?.lead_id ?? ""} aria-describedby={p.describedBy}>
              <option value="">Not set</option>
              {people.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Description" name="description" error={state.fields?.description}>
        {(p) => <Textarea id={p.id} name="description" defaultValue={team?.description ?? ""} className="min-h-20" />}
      </Field>
      <SubmitButton>{team ? "Save team" : "Create team"}</SubmitButton>
    </form>
  );
}

export function AddMemberForm({ teamId, people }: { teamId: string; people: Option[] }) {
  const [state, action] = useActionState(addTeamMemberAction, initialFormState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.message) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="team_id" value={teamId} />
      <div className="min-w-64 flex-1">
        <Field label="Add a member" name="user_id" error={state.fields?.user_id ?? state.error}>
          {(p) => (
            <Select id={p.id} name="user_id" defaultValue="">
              <option value="" disabled>
                Choose a person
              </option>
              {people.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <SubmitButton variant="outline">Add</SubmitButton>
    </form>
  );
}

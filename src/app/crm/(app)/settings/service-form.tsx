"use client";

import { useActionState, useEffect, useRef } from "react";
import { Field, Input } from "@/components/ui/form";
import { StateAlerts, SubmitButton } from "@/components/crm/form-bits";
import { initialFormState } from "@/lib/form-state";
import { addServiceAction } from "./actions";

export function AddServiceForm() {
  const [state, action] = useActionState(addServiceAction, initialFormState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.message) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-4" noValidate>
      <StateAlerts state={state} />
      <div className="grid gap-4 sm:grid-cols-[2fr_2fr_1fr]">
        <Field label="Name" name="title" error={state.fields?.title} required>
          {(p) => <Input id={p.id} name="title" required aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
        </Field>
        <Field label="Code" name="slug" error={state.fields?.slug} required hint="Must match the website's service slug, e.g. outbound-calling.">
          {(p) => <Input id={p.id} name="slug" required aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
        </Field>
        <Field label="Order" name="sort_order" error={state.fields?.sort_order}>
          {(p) => <Input id={p.id} name="sort_order" type="number" min={0} defaultValue={100} />}
        </Field>
      </div>
      <SubmitButton>Add service</SubmitButton>
    </form>
  );
}

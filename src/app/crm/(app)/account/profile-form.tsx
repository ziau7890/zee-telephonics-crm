"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Select } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import { TIMEZONE_OPTIONS } from "@/lib/format";
import { updateProfileAction } from "./actions";

export function ProfileForm({ fullName, phone, timezone }: { fullName: string; phone: string; timezone: string }) {
  const [state, action, pending] = useActionState(updateProfileAction, initialFormState);
  const f = state.fields ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.message ? <FormAlert tone="success">{state.message}</FormAlert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" name="fullName" error={f.fullName}>
          {(p) => <Input id={p.id} name="fullName" defaultValue={fullName} autoComplete="name" aria-describedby={p.describedBy} aria-invalid={p.invalid} />}
        </Field>
        <Field label="Phone" name="phone" error={f.phone}>
          {(p) => <Input id={p.id} name="phone" defaultValue={phone} type="tel" autoComplete="tel" aria-describedby={p.describedBy} aria-invalid={p.invalid} />}
        </Field>
      </div>
      <Field label="Time zone" name="timezone" error={f.timezone} hint="Times across the CRM are shown in this zone.">
        {(p) => (
          <Select id={p.id} name="timezone" defaultValue={timezone} aria-describedby={p.describedBy} aria-invalid={p.invalid}>
            {TIMEZONE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Save changes
      </Button>
    </form>
  );
}

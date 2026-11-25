"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/form";
import { initialFormState, type FormState } from "@/lib/form-state";
import {
  activateAccountAction,
  forgotPasswordAction,
  resetPasswordAction,
  sendCodeAction,
  signInAction,
  verifyCodeAction,
} from "@/app/crm/(auth)/actions";

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </Button>
  );
}

function Alerts({ state }: { state: FormState }) {
  return (
    <>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.message ? <FormAlert tone="success">{state.message}</FormAlert> : null}
    </>
  );
}

const PASSWORD_HINT = "At least 10 characters, with upper and lower case letters and a number.";

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signInAction, initialFormState);
  const f = state.fields ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <Alerts state={state} />
      <input type="hidden" name="next" value={next ?? "/crm"} />
      <Field label="Work email" name="email" error={f.email}>
        {(p) => <Input id={p.id} name="email" type="email" autoComplete="username" required aria-describedby={p.describedBy} aria-invalid={p.invalid} />}
      </Field>
      <Field label="Password" name="password" error={f.password}>
        {(p) => <Input id={p.id} name="password" type="password" autoComplete="current-password" required aria-describedby={p.describedBy} aria-invalid={p.invalid} />}
      </Field>
      <div className="flex justify-end text-sm">
        <Link href="/crm/forgot-password" className="font-medium text-accent-text hover:underline">
          Forgot password?
        </Link>
      </div>
      <Submit pending={pending}>Sign in</Submit>
    </form>
  );
}

export function SendCodeForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(sendCodeAction, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Alerts state={state} />
      <input type="hidden" name="next" value={next ?? "/crm"} />
      <Field label="Work email" name="email" error={state.fields?.email}>
        {(p) => <Input id={p.id} name="email" type="email" autoComplete="username" required aria-describedby={p.describedBy} aria-invalid={p.invalid} />}
      </Field>
      <Submit pending={pending}>Email me a sign-in code</Submit>
    </form>
  );
}

export function VerifyCodeForm({ email, next }: { email: string; next?: string }) {
  const [state, action, pending] = useActionState(verifyCodeAction, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Alerts state={state} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next ?? "/crm"} />
      <Field label="6-digit code" name="code" error={state.fields?.code ?? state.fields?.email} hint="The code expires after a few minutes.">
        {(p) => (
          <Input
            id={p.id}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            className="text-center font-mono text-2xl tracking-[0.5em]"
            required
            aria-describedby={p.describedBy}
            aria-invalid={p.invalid}
          />
        )}
      </Field>
      <Submit pending={pending}>Verify and sign in</Submit>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Alerts state={state} />
      <Field label="Work email" name="email" error={state.fields?.email}>
        {(p) => <Input id={p.id} name="email" type="email" autoComplete="username" required aria-describedby={p.describedBy} aria-invalid={p.invalid} />}
      </Field>
      <Submit pending={pending}>Send reset link</Submit>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPasswordAction, initialFormState);
  const f = state.fields ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <Alerts state={state} />
      <Field label="New password" name="password" error={f.password} hint={PASSWORD_HINT}>
        {(p) => <Input id={p.id} name="password" type="password" autoComplete="new-password" required aria-describedby={p.describedBy} aria-invalid={p.invalid} />}
      </Field>
      <Field label="Confirm new password" name="confirm" error={f.confirm}>
        {(p) => <Input id={p.id} name="confirm" type="password" autoComplete="new-password" required aria-describedby={p.describedBy} aria-invalid={p.invalid} />}
      </Field>
      <Submit pending={pending}>Update password</Submit>
    </form>
  );
}

export function ActivateForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState(activateAccountAction, initialFormState);
  const f = state.fields ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <Alerts state={state} />
      <Field label="Full name" name="fullName" error={f.fullName}>
        {(p) => <Input id={p.id} name="fullName" defaultValue={defaultName} autoComplete="name" required aria-describedby={p.describedBy} aria-invalid={p.invalid} />}
      </Field>
      <Field label="Choose a password" name="password" error={f.password} hint={PASSWORD_HINT}>
        {(p) => <Input id={p.id} name="password" type="password" autoComplete="new-password" required aria-describedby={p.describedBy} aria-invalid={p.invalid} />}
      </Field>
      <Field label="Confirm password" name="confirm" error={f.confirm}>
        {(p) => <Input id={p.id} name="confirm" type="password" autoComplete="new-password" required aria-describedby={p.describedBy} aria-invalid={p.invalid} />}
      </Field>
      <Submit pending={pending}>Activate my account</Submit>
    </form>
  );
}

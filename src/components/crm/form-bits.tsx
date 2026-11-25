"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form";
import type { FormState } from "@/lib/form-state";

export function SubmitButton({ children, variant = "primary", name, value }: { children: React.ReactNode; variant?: "primary" | "accent" | "outline" | "ghost"; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} name={name} value={value}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </Button>
  );
}

export function StateAlerts({ state }: { state: FormState }) {
  return (
    <>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.message ? <FormAlert tone="success">{state.message}</FormAlert> : null}
    </>
  );
}

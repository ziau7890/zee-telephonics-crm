import Link from "next/link";
import { FormAlert } from "@/components/ui/form";
import { SignInForm } from "@/components/crm/auth-forms";
import { safeNextPath } from "@/lib/validation";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  inactive: "This account is not active. Please contact your administrator.",
  "link-expired": "That link has expired or was already used. Please request a new one.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-display text-2xl font-bold text-navy dark:text-white">Sign in to your workspace</h1>
        <p className="text-sm text-muted">Use the company email address your administrator invited.</p>
      </div>
      {error && ERRORS[error] ? <FormAlert tone="error">{ERRORS[error]}</FormAlert> : null}
      <SignInForm next={safeNextPath(next)} />
      <p className="text-center text-sm text-muted">
        Prefer a one-time code?{" "}
        <Link href={`/crm/login/code${next ? `?next=${encodeURIComponent(safeNextPath(next))}` : ""}`} className="font-medium text-accent-text hover:underline">
          Sign in with an email code
        </Link>
      </p>
    </div>
  );
}

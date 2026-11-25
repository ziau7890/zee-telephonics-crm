import Link from "next/link";
import { SendCodeForm, VerifyCodeForm } from "@/components/crm/auth-forms";
import { safeNextPath } from "@/lib/validation";

export const metadata = { title: "Sign in with a code" };

export default async function CodeLoginPage({ searchParams }: { searchParams: Promise<{ email?: string; next?: string }> }) {
  const { email, next } = await searchParams;
  const nextPath = safeNextPath(next);
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-display text-2xl font-bold text-navy dark:text-white">{email ? "Check your email" : "Sign in with a code"}</h1>
        <p className="text-sm text-muted">
          {email ? `If ${email} has an active account, we sent it a 6-digit code.` : "We will email a one-time code to your work address."}
        </p>
      </div>
      {email ? <VerifyCodeForm email={email} next={nextPath} /> : <SendCodeForm next={nextPath} />}
      <p className="text-center text-sm text-muted">
        {email ? (
          <Link href={`/crm/login/code?next=${encodeURIComponent(nextPath)}`} className="font-medium text-accent-text hover:underline">
            Send a new code
          </Link>
        ) : (
          <Link href="/crm/login" className="font-medium text-accent-text hover:underline">
            Sign in with your password instead
          </Link>
        )}
      </p>
    </div>
  );
}

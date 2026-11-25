import Link from "next/link";
import { ForgotPasswordForm } from "@/components/crm/auth-forms";

export const metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-display text-2xl font-bold text-navy dark:text-white">Reset your password</h1>
        <p className="text-sm text-muted">Enter your work email and we will send you a secure reset link.</p>
      </div>
      <ForgotPasswordForm />
      <p className="text-center text-sm">
        <Link href="/crm/login" className="font-medium text-accent-text hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

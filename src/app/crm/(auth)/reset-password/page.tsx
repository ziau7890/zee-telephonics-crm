import { ResetPasswordForm } from "@/components/crm/auth-forms";

export const metadata = { title: "Choose a new password" };
export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-display text-2xl font-bold text-navy dark:text-white">Choose a new password</h1>
        <p className="text-sm text-muted">You will stay signed in here and be signed out everywhere else.</p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}

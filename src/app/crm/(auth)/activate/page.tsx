import { redirect } from "next/navigation";
import { ActivateForm } from "@/components/crm/auth-forms";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata = { title: "Activate your account" };
export const dynamic = "force-dynamic";

export default async function ActivatePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login?error=link-expired");
  if (user.status !== "invited") redirect("/crm");
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-display text-2xl font-bold text-navy dark:text-white">Welcome to the Zee Telephonics CRM</h1>
        <p className="text-sm text-muted">Your email {user.email} is verified. Set your name and password to activate your account.</p>
      </div>
      <ActivateForm defaultName={user.fullName} />
    </div>
  );
}

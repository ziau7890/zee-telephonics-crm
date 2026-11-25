import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: profile }, { data: logins }] = await Promise.all([
    supabase.from("profiles").select("phone").eq("id", user.id).single(),
    supabase.from("login_events").select("result, created_at, user_agent").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-navy dark:text-white">My account</h1>
        <p className="text-muted">{user.email}</p>
      </header>
      <section className="rounded-3xl border border-border bg-surface p-6 shadow-soft">
        <h2 className="mb-4 font-display text-lg font-bold">Profile</h2>
        <ProfileForm fullName={user.fullName} phone={profile?.phone ?? ""} timezone={user.timezone} />
      </section>
      <section className="rounded-3xl border border-border bg-surface p-6 shadow-soft">
        <h2 className="font-display text-lg font-bold">Password</h2>
        <p className="mt-1 text-sm text-muted">
          To change your password, use{" "}
          <Link className="font-medium text-accent-text hover:underline" href="/crm/forgot-password">
            reset password
          </Link>
          . We will email you a secure link.
        </p>
      </section>
      <section className="rounded-3xl border border-border bg-surface p-6 shadow-soft">
        <h2 className="font-display text-lg font-bold">Sign-in history</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-2 pr-4 font-medium">When ({user.timezone})</th>
                <th className="py-2 pr-4 font-medium">Event</th>
                <th className="py-2 font-medium">Device</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(logins ?? []).map((l) => (
                <tr key={l.created_at}>
                  <td className="py-2 pr-4 whitespace-nowrap">{formatDateTime(l.created_at, user.timezone)}</td>
                  <td className="py-2 pr-4 capitalize">{l.result.replace(/_/g, " ")}</td>
                  <td className="max-w-xs truncate py-2 text-muted">{l.user_agent ?? "Unknown"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!logins?.length ? <p className="py-3 text-sm text-muted">No sign-ins recorded yet.</p> : null}
        </div>
      </section>
    </div>
  );
}

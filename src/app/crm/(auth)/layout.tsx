import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/ui/logo";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center px-4 py-10">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(900px_600px_at_15%_0%,rgb(0_212_255/0.18),transparent_60%),radial-gradient(900px_700px_at_100%_100%,rgb(30_94_255/0.14),transparent_60%)]" />
      <div className="w-full max-w-md">
        <Link href="/crm" className="mb-8 flex justify-center" aria-label="Zee Telephonics CRM sign-in">
          <Logo />
        </Link>
        <div className="rounded-[1.75rem] border border-border bg-surface p-7 shadow-lift sm:p-9">{children}</div>
        <p className="mt-6 text-center text-xs text-muted">Zee Telephonics team workspace. Authorised staff only. Every sign-in is recorded.</p>
      </div>
    </main>
  );
}

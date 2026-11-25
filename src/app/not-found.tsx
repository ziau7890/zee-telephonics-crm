import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md space-y-6 text-center">
        <Link href="/crm" className="inline-block" aria-label="Zee Telephonics CRM">
          <Logo />
        </Link>
        <h1 className="font-display text-3xl font-bold text-navy dark:text-white">We couldn&apos;t find that page</h1>
        <p className="text-muted">It may have been removed, or you may not have access to it.</p>
        <ButtonLink href="/crm">Back to the dashboard</ButtonLink>
      </div>
    </main>
  );
}

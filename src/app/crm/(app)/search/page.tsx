import Link from "next/link";
import { Badge, PageHeader, Panel } from "@/components/crm/ui";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { LEAD_STATUS_LABELS, LEAD_STATUS_TONES, searchTerm, type LeadStatus } from "@/lib/crm/leads";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const user = await requireUser();
  const term = searchTerm(q);
  const supabase = await createClient();
  const like = `%${term}%`;

  const [leads, contacts, people] = term
    ? await Promise.all([
        can(user.grants, "leads", "view")
          ? supabase.from("leads").select("id, full_name, company, email, status").or(`full_name.ilike.${like},email.ilike.${like},company.ilike.${like},phone.ilike.${like}`).limit(15)
          : null,
        can(user.grants, "contacts", "view")
          ? supabase.from("contacts").select("id, full_name, company, email").or(`full_name.ilike.${like},email.ilike.${like},company.ilike.${like},phone.ilike.${like}`).limit(15)
          : null,
        can(user.grants, "users", "view") ? supabase.from("profiles").select("id, full_name, email, job_title").or(`full_name.ilike.${like},email.ilike.${like}`).limit(10) : null,
      ])
    : [null, null, null];

  const groups = [
    { title: "Leads", rows: (leads?.data ?? []).map((l) => ({ href: `/crm/leads/${l.id}`, label: l.full_name, sub: [l.company, l.email].filter(Boolean).join(" · "), status: l.status as LeadStatus | null })) },
    { title: "Contacts", rows: (contacts?.data ?? []).map((c) => ({ href: `/crm/contacts/${c.id}`, label: c.full_name, sub: [c.company, c.email].filter(Boolean).join(" · "), status: null })) },
    { title: "Staff", rows: (people?.data ?? []).map((p) => ({ href: `/crm/admin/users/${p.id}`, label: p.full_name || p.email, sub: p.job_title ?? p.email, status: null })) },
  ].filter((g) => g.rows.length);

  return (
    <>
      <PageHeader title="Search" description={term ? `Results for “${term}” in the areas you can access.` : "Type in the search box at the top. Press Ctrl K to jump there."} />
      {term && !groups.length ? <p className="text-muted">Nothing matched.</p> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        {groups.map((g) => (
          <Panel key={g.title} title={g.title}>
            <ul className="divide-y divide-border/60">
              {g.rows.map((r) => (
                <li key={r.href} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <Link href={r.href} className="block truncate font-medium hover:text-accent-text hover:underline">
                      {r.label}
                    </Link>
                    {r.sub ? <span className="block truncate text-xs text-muted">{r.sub}</span> : null}
                  </span>
                  {r.status ? <Badge tone={LEAD_STATUS_TONES[r.status]}>{LEAD_STATUS_LABELS[r.status]}</Badge> : null}
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </>
  );
}

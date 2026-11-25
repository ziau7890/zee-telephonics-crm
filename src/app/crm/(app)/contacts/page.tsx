import Link from "next/link";
import { Plus } from "lucide-react";
import { DataTable, EmptyRow, FilterBar, FilterLabel, Notice, PageHeader } from "@/components/crm/ui";
import { Input } from "@/components/ui/form";
import { Button, ButtonLink } from "@/components/ui/button";
import { requirePagePermission } from "@/lib/auth/session";
import { can, permissionScope } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { searchTerm } from "@/lib/crm/leads";

export const metadata = { title: "Contacts" };

interface Row {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  created_at: string;
  owner: { full_name: string; email: string } | null;
  leads: { count: number }[];
}

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; notice?: string }> }) {
  const { q, notice } = await searchParams;
  const user = await requirePagePermission("contacts", "view");
  const scope = permissionScope(user.grants, "contacts", "view");
  const supabase = await createClient();
  let query = supabase
    .from("contacts")
    .select("id, full_name, email, phone, company, job_title, created_at, owner:profiles!contacts_owner_id_fkey(full_name, email), leads(count)")
    .order("full_name")
    .limit(500);
  const term = searchTerm(q);
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader
        title="Contacts"
        description={scope === "own" ? "Contacts you own." : "People and companies you work with. Website enquiries create a contact automatically."}
        actions={
          can(user.grants, "contacts", "create") ? (
            <ButtonLink href="/crm/contacts/new">
              <Plus className="size-4" aria-hidden /> New contact
            </ButtonLink>
          ) : null
        }
      />
      {notice === "deleted" ? <Notice>The contact was deleted.</Notice> : null}
      <FilterBar>
        <FilterLabel label="Search">
          <Input name="q" defaultValue={q ?? ""} placeholder="Name, email, phone or company" className="min-w-64" />
        </FilterLabel>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </FilterBar>
      <DataTable
        head={["Contact", "Company", "Phone", "Leads", "Owner", "Added"]}
        empty={rows.length ? null : <EmptyRow>{q ? "No contacts match." : "No contacts yet."}</EmptyRow>}
      >
        {rows.map((c) => (
          <tr key={c.id} className="hover:bg-surface-muted/50">
            <td className="px-4 py-3">
              <Link href={`/crm/contacts/${c.id}`} className="font-medium hover:text-accent-text hover:underline">
                {c.full_name}
              </Link>
              <p className="text-xs text-muted">{c.email ?? ""}</p>
            </td>
            <td className="px-4 py-3">
              {c.company ?? <span className="text-muted">None</span>}
              {c.job_title ? <p className="text-xs text-muted">{c.job_title}</p> : null}
            </td>
            <td className="px-4 py-3 whitespace-nowrap">{c.phone ?? <span className="text-muted">None</span>}</td>
            <td className="px-4 py-3">{c.leads[0]?.count ?? 0}</td>
            <td className="px-4 py-3">{c.owner ? c.owner.full_name || c.owner.email : <span className="text-muted">Nobody</span>}</td>
            <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(c.created_at, user.timezone, { dateStyle: "medium", timeStyle: undefined })}</td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}

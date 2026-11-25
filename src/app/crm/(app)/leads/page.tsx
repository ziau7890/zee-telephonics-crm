import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge, DataTable, EmptyRow, FilterBar, FilterLabel, Notice, PageHeader } from "@/components/crm/ui";
import { Input, Select } from "@/components/ui/form";
import { Button, ButtonLink } from "@/components/ui/button";
import { requirePagePermission } from "@/lib/auth/session";
import { can, permissionScope } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { getServices, getStaffOptions, serviceTitle } from "@/lib/crm/server";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_STATUS_TONES, SOURCES, SOURCE_LABELS, isLeadStatus, isSource, searchTerm, type LeadStatus } from "@/lib/crm/leads";

export const metadata = { title: "Leads" };

interface Row {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  service_interest: string | null;
  status: LeadStatus;
  priority: string;
  source: string;
  created_at: string;
  last_activity_at: string;
  owner: { full_name: string; email: string } | null;
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; owner?: string; source?: string; notice?: string }> }) {
  const { status, q, owner, source, notice } = await searchParams;
  const user = await requirePagePermission("leads", "view");
  const scope = permissionScope(user.grants, "leads", "view");
  const supabase = await createClient();
  const [services, people] = await Promise.all([getServices(), scope === "own" ? Promise.resolve([]) : getStaffOptions()]);

  let query = supabase
    .from("leads")
    .select("id, full_name, email, phone, company, service_interest, status, priority, source, created_at, last_activity_at, owner:profiles!leads_owner_id_fkey(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (status === "open") query = query.not("status", "in", "(won,lost)");
  else if (isLeadStatus(status)) query = query.eq("status", status);
  if (isSource(source)) query = query.eq("source", source);
  if (owner === "me") query = query.eq("owner_id", user.id);
  else if (owner === "none") query = query.is("owner_id", null);
  else if (owner && /^[0-9a-f-]{36}$/.test(owner)) query = query.eq("owner_id", owner);
  const term = searchTerm(q);
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];
  const filtered = Boolean(q || status || owner || source);

  return (
    <>
      <PageHeader
        title="Leads"
        description={
          scope === "own"
            ? "Leads assigned to you."
            : scope === "team"
              ? "Leads owned by you and your team."
              : "Every enquiry, including new website form submissions waiting to be assigned."
        }
        actions={
          can(user.grants, "leads", "create") ? (
            <ButtonLink href="/crm/leads/new">
              <Plus className="size-4" aria-hidden /> New lead
            </ButtonLink>
          ) : null
        }
      />
      {notice === "deleted" ? <Notice>The lead was deleted.</Notice> : null}
      <FilterBar>
        <FilterLabel label="Search">
          <Input name="q" defaultValue={q ?? ""} placeholder="Name, email, phone or company" className="min-w-60" />
        </FilterLabel>
        <FilterLabel label="Status">
          <Select name="status" defaultValue={status ?? ""} className="min-w-40">
            <option value="">All statuses</option>
            <option value="open">All open</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FilterLabel>
        {scope !== "own" ? (
          <FilterLabel label="Assigned to">
            <Select name="owner" defaultValue={owner ?? ""} className="min-w-40">
              <option value="">Anyone</option>
              <option value="me">Me</option>
              {scope === "all" ? <option value="none">Nobody yet</option> : null}
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FilterLabel>
        ) : null}
        <FilterLabel label="Source">
          <Select name="source" defaultValue={source ?? ""} className="min-w-36">
            <option value="">Any source</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </Select>
        </FilterLabel>
        <Button type="submit" variant="outline">
          Filter
        </Button>
        {filtered ? (
          <Link href="/crm/leads" className="pb-2.5 text-sm font-medium text-accent-text hover:underline">
            Clear
          </Link>
        ) : null}
      </FilterBar>
      <p className="mb-3 text-sm text-muted">
        {rows.length === 500 ? "Showing the newest 500. Narrow the filters to see older leads." : `${rows.length} ${rows.length === 1 ? "lead" : "leads"}`}
      </p>
      <DataTable
        head={["Lead", "Service", "Status", "Assigned to", "Last activity", "Received"]}
        empty={rows.length ? null : <EmptyRow>{filtered ? "No leads match these filters." : "No leads yet. Website enquiries appear here as soon as they are sent."}</EmptyRow>}
      >
        {rows.map((l) => (
          <tr key={l.id} className="hover:bg-surface-muted/50">
            <td className="px-4 py-3">
              <Link href={`/crm/leads/${l.id}`} className="font-medium hover:text-accent-text hover:underline">
                {l.full_name}
              </Link>
              <p className="text-xs text-muted">{[l.company, l.email ?? l.phone].filter(Boolean).join(" · ")}</p>
            </td>
            <td className="px-4 py-3">{serviceTitle(services, l.service_interest) ?? <span className="text-muted">Not given</span>}</td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={LEAD_STATUS_TONES[l.status]}>{LEAD_STATUS_LABELS[l.status]}</Badge>
                {l.priority === "high" ? <Badge tone="red">High</Badge> : null}
              </div>
            </td>
            <td className="px-4 py-3">{l.owner ? l.owner.full_name || l.owner.email : <Badge tone="amber">Unassigned</Badge>}</td>
            <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDateTime(l.last_activity_at, user.timezone, { dateStyle: "medium", timeStyle: undefined })}</td>
            <td className="px-4 py-3 whitespace-nowrap">
              {formatDateTime(l.created_at, user.timezone, { dateStyle: "medium", timeStyle: undefined })}
              {l.source === "website" ? <p className="text-xs text-muted">Website</p> : null}
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}

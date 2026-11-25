import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { DataTable, EmptyRow, PageHeader, Tabs } from "@/components/crm/ui";
import { requirePagePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, localInputToUtc } from "@/lib/format";

export const metadata = { title: "Audit log" };

const PAGE_SIZE = 50;
const ENTITY_TYPES = ["lead", "contact", "follow_up", "leads", "profile", "team", "role", "service"];
const ENTITY_LINKS: Record<string, string> = { lead: "/crm/leads/", contact: "/crm/contacts/", profile: "/crm/admin/users/", team: "/crm/admin/teams/", role: "/crm/admin/roles/" };

interface SearchParams {
  view?: string;
  entity?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: string;
}

function pageHref(params: SearchParams, page: number) {
  const sp = new URLSearchParams(Object.entries({ ...params, page: String(page) }).filter(([, v]) => v) as [string, string][]);
  return `/crm/admin/audit?${sp.toString()}`;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const user = await requirePagePermission("audit_logs", "view");
  const supabase = await createClient();
  const view = params.view === "sign-ins" ? "sign-ins" : "changes";
  const page = Math.max(1, Number(params.page) || 1);
  const fromIso = params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? localInputToUtc(`${params.from}T00:00`, user.timezone) : null;
  const toIso = params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? localInputToUtc(`${params.to}T23:59`, user.timezone) : null;
  const term = params.q?.trim().replace(/[%,()]/g, "");
  const range = [(page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1] as const;

  let rows: React.ReactNode[] = [];
  let total = 0;
  if (view === "changes") {
    let q = supabase
      .from("audit_logs")
      .select("id, action, entity_type, entity_id, ip_address, created_at, actor:profiles(full_name, email)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(...range);
    if (params.entity && ENTITY_TYPES.includes(params.entity)) q = q.eq("entity_type", params.entity);
    if (term) q = q.ilike("action", `%${term}%`);
    if (fromIso) q = q.gte("created_at", fromIso);
    if (toIso) q = q.lte("created_at", toIso);
    const { data, count } = await q;
    total = count ?? 0;
    rows = ((data ?? []) as unknown as { id: number; action: string; entity_type: string; entity_id: string | null; ip_address: string | null; created_at: string; actor: { full_name: string; email: string } | null }[]).map((r) => (
      <tr key={r.id}>
        <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(r.created_at, user.timezone)}</td>
        <td className="px-4 py-3">{r.actor ? r.actor.full_name || r.actor.email : <span className="text-muted">System</span>}</td>
        <td className="px-4 py-3 font-mono text-xs">{r.action}</td>
        <td className="px-4 py-3">
          {ENTITY_LINKS[r.entity_type] && r.entity_id && !r.action.endsWith(".deleted") ? (
            <Link href={`${ENTITY_LINKS[r.entity_type]}${r.entity_id}`} className="hover:text-accent-text hover:underline">
              {r.entity_type}
            </Link>
          ) : (
            r.entity_type
          )}
        </td>
        <td className="px-4 py-3 font-mono text-xs">{r.ip_address ?? ""}</td>
      </tr>
    ));
  } else {
    let q = supabase
      .from("login_events")
      .select("id, email, result, ip_address, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(...range);
    if (term) q = q.ilike("email", `%${term}%`);
    if (fromIso) q = q.gte("created_at", fromIso);
    if (toIso) q = q.lte("created_at", toIso);
    const { data, count } = await q;
    total = count ?? 0;
    rows = (data ?? []).map((r) => (
      <tr key={r.id}>
        <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(r.created_at, user.timezone)}</td>
        <td className="px-4 py-3">{r.email}</td>
        <td className="px-4 py-3 capitalize">{String(r.result).replace(/_/g, " ")}</td>
        <td className="px-4 py-3 font-mono text-xs">{r.ip_address ?? ""}</td>
      </tr>
    ));
  }
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader title="Audit log" description="Sensitive changes and sign-in activity. Entries cannot be edited or deleted from the CRM." />
      <Tabs
        active={view === "changes" ? "/crm/admin/audit" : "/crm/admin/audit?view=sign-ins"}
        items={[
          { href: "/crm/admin/audit", label: "Changes" },
          { href: "/crm/admin/audit?view=sign-ins", label: "Sign-in activity" },
        ]}
      />
      <form className="mb-4 flex flex-wrap items-end gap-3" role="search">
        {view === "sign-ins" ? <input type="hidden" name="view" value="sign-ins" /> : null}
        <label className="text-sm">
          <span className="mb-1 block text-muted">{view === "changes" ? "Action contains" : "Email contains"}</span>
          <Input name="q" defaultValue={params.q ?? ""} placeholder={view === "changes" ? "e.g. salary" : "name@"} className="min-w-52" />
        </label>
        {view === "changes" ? (
          <label className="text-sm">
            <span className="mb-1 block text-muted">Record type</span>
            <Select name="entity" defaultValue={params.entity ?? ""} className="min-w-44">
              <option value="">All types</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <label className="text-sm">
          <span className="mb-1 block text-muted">From</span>
          <Input name="from" type="date" defaultValue={params.from ?? ""} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">To</span>
          <Input name="to" type="date" defaultValue={params.to ?? ""} />
        </label>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      <DataTable
        head={view === "changes" ? ["When", "Who", "Action", "Record", "IP address"] : ["When", "Email", "Result", "IP address"]}
        empty={rows.length ? null : <EmptyRow>Nothing recorded for these filters.</EmptyRow>}
      >
        {rows}
      </DataTable>
      <div className="mt-4 flex items-center justify-between text-sm text-muted">
        <span>
          {total} {total === 1 ? "entry" : "entries"} · page {page} of {pages}
        </span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link href={pageHref(params, page - 1)} className="rounded-full border border-border px-4 py-1.5 hover:text-foreground">
              Newer
            </Link>
          ) : null}
          {page < pages ? (
            <Link href={pageHref(params, page + 1)} className="rounded-full border border-border px-4 py-1.5 hover:text-foreground">
              Older
            </Link>
          ) : null}
        </div>
      </div>
    </>
  );
}

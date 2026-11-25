import { PageHeader, Panel } from "@/components/crm/ui";
import { LeadCreateForm } from "@/components/crm/record-forms";
import { requirePagePermission } from "@/lib/auth/session";
import { permissionScope } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getServices, getStaffOptions } from "@/lib/crm/server";

export const metadata = { title: "New lead" };

export default async function NewLeadPage({ searchParams }: { searchParams: Promise<{ contact?: string }> }) {
  const { contact } = await searchParams;
  const user = await requirePagePermission("leads", "create");
  const canAssign = permissionScope(user.grants, "leads", "create") !== "own";
  const supabase = await createClient();
  const [services, people, fromContact] = await Promise.all([
    getServices(),
    canAssign ? getStaffOptions() : Promise.resolve([]),
    contact && /^[0-9a-f-]{36}$/.test(contact) ? supabase.from("contacts").select("id, full_name, email, phone, company").eq("id", contact).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const c = fromContact.data;

  return (
    <>
      <PageHeader
        title="New lead"
        description={c ? `A new enquiry or opportunity for ${c.full_name}.` : "For enquiries that arrive by phone, email or referral. Website enquiries are added automatically."}
        back={c ? { href: `/crm/contacts/${c.id}`, label: c.full_name } : { href: "/crm/leads", label: "Leads" }}
      />
      <Panel>
        <LeadCreateForm
          services={services}
          people={people}
          canAssign={canAssign}
          defaults={c ? { contact_id: c.id, full_name: c.full_name, email: c.email ?? "", phone: c.phone ?? "", company: c.company ?? "" } : undefined}
        />
      </Panel>
    </>
  );
}

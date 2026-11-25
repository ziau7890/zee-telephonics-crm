import { PageHeader, Panel } from "@/components/crm/ui";
import { ContactForm } from "@/components/crm/record-forms";
import { requirePagePermission } from "@/lib/auth/session";
import { permissionScope } from "@/lib/auth/permissions";
import { getStaffOptions } from "@/lib/crm/server";

export const metadata = { title: "New contact" };

export default async function NewContactPage() {
  const user = await requirePagePermission("contacts", "create");
  const canAssign = permissionScope(user.grants, "contacts", "create") !== "own";
  const people = canAssign ? await getStaffOptions() : [];
  return (
    <>
      <PageHeader title="New contact" back={{ href: "/crm/contacts", label: "Contacts" }} />
      <Panel>
        <ContactForm people={people} canAssign={canAssign} />
      </Panel>
    </>
  );
}

import { Badge, PageHeader, Panel } from "@/components/crm/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getServices } from "@/lib/crm/server";
import { updateServiceAction } from "./actions";
import { AddServiceForm } from "./service-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requirePagePermission("settings", "view");
  const canEdit = can(user.grants, "settings", "edit");
  const services = await getServices();
  return (
    <>
      <PageHeader title="Settings" description="Services you offer. Website enquiries and lead forms use this list." />
      <Panel title="Services">
        <p className="mb-4 text-sm text-muted">
          These start as the website&rsquo;s provisional services. The code links a website enquiry to the right service, so keep it the same as the website&rsquo;s slug. Turning a service off hides it from new leads but keeps it on old ones.
        </p>
        <ul className="divide-y divide-border/70">
          {services.map((s) => (
            <li key={s.slug} className="py-3">
              {canEdit ? (
                <form action={updateServiceAction} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="slug" value={s.slug} />
                  <input type="hidden" name="active" value={s.active ? "true" : "false"} />
                  <label className="min-w-56 flex-1">
                    <span className="sr-only">Name for {s.slug}</span>
                    <Input name="title" defaultValue={s.title} required minLength={2} maxLength={120} />
                  </label>
                  <code className="text-xs text-muted">{s.slug}</code>
                  {s.active ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}
                  <Button type="submit" variant="outline" size="sm">
                    Save name
                  </Button>
                  <Button type="submit" variant="ghost" size="sm" name="active" value={s.active ? "false" : "true"}>
                    {s.active ? "Turn off" : "Turn on"}
                  </Button>
                </form>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span>{s.title}</span>
                  {s.active ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}
                </div>
              )}
            </li>
          ))}
        </ul>
        {canEdit ? (
          <div className="mt-6 border-t border-border pt-6">
            <h3 className="mb-3 font-display font-bold">Add a service</h3>
            <AddServiceForm />
          </div>
        ) : null}
      </Panel>
    </>
  );
}

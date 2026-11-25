"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Field, Input, Select } from "@/components/ui/form";
import { StateAlerts, SubmitButton } from "@/components/crm/form-bits";
import { initialFormState } from "@/lib/form-state";
import { PERMISSION_ACTIONS, type PermissionScope } from "@/lib/auth/permissions";
import { MODULE_GROUPS } from "@/lib/crm/people";
import { inviteUserAction, saveRoleAction, saveRolePermissionsAction, setUserRolesAction, setUserStatusAction } from "./actions";

type Option = { id: string; name: string };

export function InviteUserForm({ roles, canAssignRoles, domains }: { roles: Option[]; canAssignRoles: boolean; domains: string[] }) {
  const [state, action] = useActionState(inviteUserAction, initialFormState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.message) ref.current?.reset();
  }, [state]);
  const f = state.fields ?? {};
  return (
    <form ref={ref} action={action} className="space-y-4" noValidate>
      <StateAlerts state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Full name" name="full_name" error={f.full_name} required>
          {(p) => <Input id={p.id} name="full_name" autoComplete="off" aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
        </Field>
        <Field label="Company email" name="email" error={f.email} required hint={domains.length ? `Must end in @${domains.join(" or @")}` : undefined}>
          {(p) => <Input id={p.id} name="email" type="email" autoComplete="off" aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
        </Field>
        {canAssignRoles ? (
          <Field label="Role" name="role_id" error={f.role_id} hint="Least access first. You can add roles later.">
            {(p) => (
              <Select id={p.id} name="role_id" defaultValue="" aria-describedby={p.describedBy}>
                <option value="">No role yet</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
      </div>
      <SubmitButton>Send invitation</SubmitButton>
    </form>
  );
}

export function UserStatusForm({ id, status }: { id: string; status: string }) {
  const [state, action] = useActionState(setUserStatusAction, initialFormState);
  const next = status === "deactivated" ? "active" : "deactivated";
  return (
    <form action={action} className="space-y-3">
      <StateAlerts state={state} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={next} />
      <p className="text-sm text-muted">
        {next === "deactivated"
          ? "Deactivating signs the person out on their next request and blocks all CRM access. Their records stay."
          : "Reactivating restores access with the roles they already have."}
      </p>
      <SubmitButton variant={next === "deactivated" ? "outline" : "primary"}>{next === "deactivated" ? "Deactivate account" : "Reactivate account"}</SubmitButton>
    </form>
  );
}

export function UserRolesForm({ id, roles, assigned }: { id: string; roles: (Option & { description: string | null })[]; assigned: string[] }) {
  const [state, action] = useActionState(setUserRolesAction, initialFormState);
  return (
    <form action={action} className="space-y-4">
      <StateAlerts state={state} />
      <input type="hidden" name="id" value={id} />
      <fieldset className="space-y-2">
        <legend className="sr-only">Roles</legend>
        {roles.map((r) => (
          <label key={r.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 hover:bg-surface-muted/50">
            <input type="checkbox" name="role_id" value={r.id} defaultChecked={assigned.includes(r.id)} className="mt-1 size-4 accent-brand-green" />
            <span>
              <span className="block text-sm font-medium">{r.name}</span>
              {r.description ? <span className="block text-xs text-muted">{r.description}</span> : null}
            </span>
          </label>
        ))}
      </fieldset>
      <SubmitButton>Save roles</SubmitButton>
    </form>
  );
}

export function RoleForm({ role }: { role?: { id: string; name: string; description: string | null } }) {
  const [state, action] = useActionState(saveRoleAction, initialFormState);
  const f = state.fields ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <StateAlerts state={state} />
      <input type="hidden" name="id" value={role?.id ?? ""} />
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <Field label="Role name" name="name" error={f.name} required>
          {(p) => <Input id={p.id} name="name" defaultValue={role?.name} aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
        </Field>
        <Field label="Description" name="description" error={f.description}>
          {(p) => <Input id={p.id} name="description" defaultValue={role?.description ?? ""} />}
        </Field>
      </div>
      <SubmitButton variant={role ? "outline" : "primary"}>{role ? "Save name and description" : "Create role"}</SubmitButton>
    </form>
  );
}

const ACTION_LABELS: Record<string, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  export: "Export",
  manage: "Full",
};

export function PermissionMatrix({
  roleId,
  granted,
  scopes,
  readOnly,
}: {
  roleId: string;
  granted: string[];
  scopes: Record<string, PermissionScope>;
  readOnly: boolean;
}) {
  const [state, action] = useActionState(saveRolePermissionsAction, initialFormState);
  const [checked, setChecked] = useState(() => new Set(granted));
  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <form action={action} className="space-y-4">
      <StateAlerts state={state} />
      <input type="hidden" name="role_id" value={roleId} />
      <p className="text-sm text-muted">
        &ldquo;Full&rdquo; includes every action. For leads, contacts, follow-ups and reports, scope limits a role to all records, records owned by their team, or only records assigned to them.
      </p>
      <div className="overflow-x-auto rounded-3xl border border-border bg-surface shadow-soft">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-muted/60 text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium">
                Module
              </th>
              {PERMISSION_ACTIONS.map((a) => (
                <th key={a} scope="col" className="px-2 py-3 text-center font-medium">
                  {ACTION_LABELS[a]}
                </th>
              ))}
              <th scope="col" className="px-4 py-3 text-left font-medium">
                Scope
              </th>
            </tr>
          </thead>
          {MODULE_GROUPS.map((group) => (
            <tbody key={group.label} className="divide-y divide-border border-b border-border">
              <tr className="bg-surface-muted/30">
                <th colSpan={PERMISSION_ACTIONS.length + 2} scope="colgroup" className="px-4 py-2 text-left text-xs font-semibold tracking-wide text-muted uppercase">
                  {group.label}
                </th>
              </tr>
              {group.modules.map((m) => {
                const any = PERMISSION_ACTIONS.some((a) => checked.has(`${m.key}:${a}`));
                return (
                  <tr key={m.key}>
                    <th scope="row" className="px-4 py-2 text-left font-medium whitespace-nowrap">
                      {m.label}
                    </th>
                    {PERMISSION_ACTIONS.map((a) => {
                      const key = `${m.key}:${a}`;
                      return (
                        <td key={a} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            name="perm"
                            value={key}
                            checked={checked.has(key)}
                            onChange={() => toggle(key)}
                            disabled={readOnly}
                            aria-label={`${m.label}: ${ACTION_LABELS[a]}`}
                            className="size-4 accent-[#007a99]"
                          />
                        </td>
                      );
                    })}
                    <td className="px-4 py-2">
                      <select
                        name={`scope:${m.key}`}
                        defaultValue={scopes[m.key] ?? "all"}
                        disabled={readOnly || !any || !m.scoped}
                        aria-label={`${m.label} scope`}
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-sm disabled:opacity-50"
                      >
                        <option value="all">All records</option>
                        <option value="team">Their teams</option>
                        <option value="own">Own only</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
      {readOnly ? null : <SubmitButton>Save permissions</SubmitButton>}
    </form>
  );
}

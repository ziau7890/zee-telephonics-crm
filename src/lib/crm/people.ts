/** Labels for users, roles and the permission matrix. */

export const ACCOUNT_STATUS_LABELS = { invited: "Invited", active: "Active", deactivated: "Deactivated" } as const;
export type AccountStatus = keyof typeof ACCOUNT_STATUS_LABELS;

/** Modules in the permission matrix. Keys match public.permissions.module. */
export const MODULE_GROUPS: { label: string; modules: { key: string; label: string; scoped?: boolean }[] }[] = [
  {
    label: "Sales",
    modules: [
      { key: "dashboard", label: "Dashboard" },
      { key: "leads", label: "Leads", scoped: true },
      { key: "contacts", label: "Contacts", scoped: true },
      { key: "follow_ups", label: "Follow-ups", scoped: true },
      { key: "reports", label: "Reports", scoped: true },
    ],
  },
  {
    label: "Team and access",
    modules: [
      { key: "teams", label: "Teams" },
      { key: "users", label: "Users" },
      { key: "roles", label: "Roles and permissions" },
      { key: "audit_logs", label: "Audit log" },
      { key: "settings", label: "Settings (services)" },
    ],
  },
];

export const ALL_MODULES = MODULE_GROUPS.flatMap((g) => g.modules.map((m) => m.key));

export function initials(name: string, fallback = "?") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * Permission model shared by server code and UI. The database (has_permission,
 * permission_scope and row-level security) is the source of truth; these
 * helpers decide what to render and guard server actions before any query.
 */
export const PERMISSION_ACTIONS = ["view", "create", "edit", "delete", "export", "manage"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
export type PermissionScope = "all" | "team" | "own";

export interface PermissionGrant {
  module: string;
  action: PermissionAction;
  scope: PermissionScope;
}

const SCOPE_RANK: Record<PermissionScope, number> = { all: 3, team: 2, own: 1 };

/** Widest scope granted for module/action ("manage" implies every action), or null. */
export function permissionScope(
  grants: readonly PermissionGrant[],
  module: string,
  action: PermissionAction,
): PermissionScope | null {
  let best: PermissionScope | null = null;
  for (const g of grants) {
    if (g.module !== module) continue;
    if (g.action !== action && g.action !== "manage") continue;
    if (!best || SCOPE_RANK[g.scope] > SCOPE_RANK[best]) best = g.scope;
  }
  return best;
}

export function can(grants: readonly PermissionGrant[], module: string, action: PermissionAction) {
  return permissionScope(grants, module, action) !== null;
}

/** CRM navigation. An item shows only when the user can view its module. */
export interface NavItem {
  href: string;
  label: string;
  module: string | null; // null = every signed-in user
  icon: string;
}

export const CRM_NAV: NavItem[] = [
  { href: "/crm", label: "Dashboard", module: null, icon: "LayoutDashboard" },
  { href: "/crm/leads", label: "Leads", module: "leads", icon: "Inbox" },
  { href: "/crm/contacts", label: "Contacts", module: "contacts", icon: "Contact" },
  { href: "/crm/follow-ups", label: "Follow-ups", module: "follow_ups", icon: "CalendarClock" },
  { href: "/crm/reports", label: "Reports", module: "reports", icon: "ChartColumn" },
  { href: "/crm/admin/teams", label: "Teams", module: "teams", icon: "Users" },
  { href: "/crm/admin/users", label: "Users", module: "users", icon: "UserCog" },
  { href: "/crm/admin/roles", label: "Roles", module: "roles", icon: "ShieldCheck" },
  { href: "/crm/admin/audit", label: "Audit log", module: "audit_logs", icon: "ScrollText" },
  { href: "/crm/settings", label: "Settings", module: "settings", icon: "Settings" },
];

export function visibleNav(grants: readonly PermissionGrant[], items: NavItem[] = CRM_NAV) {
  return items.filter((item) => item.module === null || can(grants, item.module, "view"));
}

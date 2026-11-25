import { describe, expect, it } from "vitest";
import { CRM_NAV, can, permissionScope, visibleNav, type PermissionGrant } from "@/lib/auth/permissions";
import { ALL_MODULES } from "@/lib/crm/people";
import { parseMatrix } from "@/lib/crm/matrix";

const agent: PermissionGrant[] = [
  { module: "dashboard", action: "view", scope: "all" },
  { module: "leads", action: "view", scope: "own" },
  { module: "leads", action: "edit", scope: "own" },
  { module: "follow_ups", action: "view", scope: "own" },
];
const mixed: PermissionGrant[] = [
  { module: "leads", action: "view", scope: "own" },
  { module: "leads", action: "view", scope: "team" },
  { module: "settings", action: "manage", scope: "all" },
];

describe("permissions", () => {
  it("picks the widest scope when roles overlap", () => {
    expect(permissionScope(mixed, "leads", "view")).toBe("team");
  });
  it("treats manage as every action", () => {
    expect(can(mixed, "settings", "delete")).toBe(true);
    expect(permissionScope(mixed, "settings", "export")).toBe("all");
  });
  it("denies what was not granted", () => {
    expect(can(agent, "reports", "view")).toBe(false);
    expect(can(agent, "leads", "delete")).toBe(false);
  });
  it("shows an agent only their modules in the sidebar", () => {
    expect(visibleNav(agent).map((i) => i.label)).toEqual(["Dashboard", "Leads", "Follow-ups"]);
  });
  it("every nav module exists in the permission matrix", () => {
    for (const item of CRM_NAV) if (item.module) expect(ALL_MODULES).toContain(item.module);
  });
});

describe("permission matrix form", () => {
  it("keeps known module:action pairs with their scope and drops tampered ones", () => {
    const fd = new FormData();
    fd.append("perm", "leads:view");
    fd.append("perm", "leads:edit");
    fd.append("perm", "leads:view"); // duplicate
    fd.append("perm", "payroll:view"); // unknown module
    fd.append("perm", "leads:approve"); // unknown action
    fd.append("perm", "leads:view:extra");
    fd.append("scope:leads", "own");
    expect(parseMatrix(fd)).toEqual([
      { module: "leads", action: "view", scope: "own" },
      { module: "leads", action: "edit", scope: "own" },
    ]);
  });
  it("falls back to all for a forged scope", () => {
    const fd = new FormData();
    fd.append("perm", "reports:view");
    fd.append("scope:reports", "everyone");
    expect(parseMatrix(fd)).toEqual([{ module: "reports", action: "view", scope: "all" }]);
  });
});

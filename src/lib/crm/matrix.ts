import { PERMISSION_ACTIONS, type PermissionScope } from "@/lib/auth/permissions";
import { ALL_MODULES } from "./people";

const SCOPES: PermissionScope[] = ["all", "team", "own"];

export interface MatrixGrant {
  module: string;
  action: string;
  scope: PermissionScope;
}

/**
 * Reads the permission matrix form: checkboxes named "perm" with "module:action"
 * values, and one "scope:<module>" select per row. Unknown modules, actions and
 * scopes are dropped, so a tampered form cannot grant anything that does not exist.
 */
export function parseMatrix(formData: FormData): MatrixGrant[] {
  const grants: MatrixGrant[] = [];
  const seen = new Set<string>();
  for (const value of formData.getAll("perm").map(String)) {
    const [module, action, extra] = value.split(":");
    if (extra !== undefined) continue;
    if (!ALL_MODULES.includes(module) || !(PERMISSION_ACTIONS as readonly string[]).includes(action)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    const rawScope = String(formData.get(`scope:${module}`) ?? "all") as PermissionScope;
    grants.push({ module, action, scope: SCOPES.includes(rawScope) ? rawScope : "all" });
  }
  return grants;
}

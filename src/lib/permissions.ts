/**
 * Central permission rules for the two-role model (see admin-auth.tsx).
 * Every gate in the UI — sidebar links, section tabs, route guards —
 * reads from here, so the restriction only needs to be defined once.
 */
import type { AdminRole } from "@/lib/admin-auth";

/** Paths only reachable by Super Admin — hidden from nav and blocked directly. */
const SUPER_ADMIN_ONLY_PATHS = ["/roles"];

/** Financial paths restricted for Ops/Support — payout, commission, and GMV/revenue data. */
const FINANCE_RESTRICTED_PATHS = ["/payments", "/payments/payouts", "/payments/summary"];

export function canAccessPath(role: AdminRole, path: string): boolean {
  if (role === "Super Admin") return true;
  if (SUPER_ADMIN_ONLY_PATHS.includes(path)) return false;
  if (FINANCE_RESTRICTED_PATHS.includes(path)) return false;
  return true;
}

/**
 * Whether a sidebar item should be dropped from the nav entirely for this
 * role, vs. kept but pointed somewhere the role can actually reach (that
 * second case is handled by the caller — see Payments in AdminShell).
 */
export function isNavItemHidden(role: AdminRole, href: string): boolean {
  return role !== "Super Admin" && SUPER_ADMIN_ONLY_PATHS.includes(href);
}

export function canAccessFinancials(role: AdminRole): boolean {
  return role === "Super Admin";
}

export function canManageAdmins(role: AdminRole): boolean {
  return role === "Super Admin";
}

/** Where an Ops/Support admin should land when Payments is restricted to Refunds only. */
export const OPS_SUPPORT_PAYMENTS_HOME = "/payments/refunds";

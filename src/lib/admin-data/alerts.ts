/**
 * Real "needs your attention" alerts for the top-nav notification bell,
 * replacing src/data/dashboard.ts's `alerts` (mock — fixed counts that
 * never changed no matter what was actually happening).
 *
 * Role-aware the same way the rest of the RBAC in this app is: an
 * Ops/Support session simply never queries the finance-restricted
 * sources (refund requests, failed payouts, reconciliation mismatches) —
 * RLS would return them empty anyway, but skipping the query avoids
 * console noise from a call that was never going to return anything.
 */
import { supabase } from "@/lib/supabaseClient";
import type { AdminRole } from "@/lib/admin-auth";
import { canAccessPath } from "@/lib/permissions";

export type AlertSeverity = "critical" | "warning" | "info";

export type AlertItem = {
  id: string;
  message: string;
  severity: AlertSeverity;
  actionLabel: string;
  href: string;
};

async function countWhereEqual(table: string, column: string, value: string | boolean) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);
  if (error) {
    console.error(`alerts: count(${table}.${column}=${value}) failed:`, error.message);
    return 0;
  }
  return count ?? 0;
}

export async function listAdminAlerts(role: AdminRole): Promise<AlertItem[]> {
  const alerts: AlertItem[] = [];

  const [pendingVenues, flaggedPartners, unresolvedFlags] = await Promise.all([
    countWhereEqual("venues", "approval_status", "pending"),
    countWhereEqual("partners", "flagged", true),
    countWhereEqual("booking_flags", "resolution", "unresolved"),
  ]);

  if (pendingVenues > 0) {
    alerts.push({
      id: "pending-venues",
      message: `${pendingVenues} venue${pendingVenues === 1 ? "" : "s"} pending approval`,
      severity: "warning",
      actionLabel: "Review",
      href: "/venues/approvals",
    });
  }
  if (flaggedPartners > 0) {
    alerts.push({
      id: "flagged-partners",
      message: `${flaggedPartners} partner${flaggedPartners === 1 ? "" : "s"} flagged for review`,
      severity: "warning",
      actionLabel: "Review",
      href: "/venues/partners",
    });
  }
  if (unresolvedFlags > 0) {
    alerts.push({
      id: "unresolved-disputes",
      message: `${unresolvedFlags} dispute${unresolvedFlags === 1 ? "" : "s"}/no-show${unresolvedFlags === 1 ? "" : "s"} awaiting review`,
      severity: "warning",
      actionLabel: "Review",
      href: "/bookings/disputes",
    });
  }

  if (canAccessPath(role, "/payments/refunds") && canAccessPath(role, "/payments")) {
    const [pendingRefunds, failedPayouts, openMismatches] = await Promise.all([
      countWhereEqual("refund_requests", "status", "pending"),
      countWhereEqual("payouts", "status", "failed"),
      countWhereEqual("reconciliation_flags", "status", "open"),
    ]);

    if (pendingRefunds > 0) {
      alerts.push({
        id: "pending-refunds",
        message: `${pendingRefunds} refund request${pendingRefunds === 1 ? "" : "s"} awaiting review`,
        severity: "warning",
        actionLabel: "Review",
        href: "/payments/refunds",
      });
    }
    if (failedPayouts > 0) {
      alerts.push({
        id: "failed-payouts",
        message: `${failedPayouts} payout${failedPayouts === 1 ? "" : "s"} failed`,
        severity: "critical",
        actionLabel: "Investigate",
        href: "/payments/payouts",
      });
    }
    if (openMismatches > 0) {
      alerts.push({
        id: "reconciliation-mismatches",
        message: `${openMismatches} payment${openMismatches === 1 ? "" : "s"} don't match Razorpay's records`,
        severity: "critical",
        actionLabel: "Investigate",
        href: "/payments",
      });
    }
  }

  return alerts;
}
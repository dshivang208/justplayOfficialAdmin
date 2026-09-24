import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/lib/admin-auth";
import { canAccessPath } from "@/lib/permissions";
import { listRefundRequests } from "@/lib/admin-data/refunds";
import { listPayouts } from "@/lib/admin-data/payouts";

const tabs = [
  { label: "Transactions", href: "/payments" },
  { label: "Payouts", href: "/payments/payouts" },
  { label: "Refunds", href: "/payments/refunds" },
  { label: "Summary", href: "/payments/summary" },
] as const;

export function PaymentSectionTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { admin } = useAdminAuth();
  const role = admin?.role ?? "Super Admin";
  const [pendingRefunds, setPendingRefunds] = useState(0);
  const [failedPayouts, setFailedPayouts] = useState(0);

  useEffect(() => {
    listRefundRequests()
      .then((rows) => setPendingRefunds(rows.filter((r) => r.status === "pending").length))
      .catch(() => setPendingRefunds(0));
    listPayouts()
      .then((rows) => setFailedPayouts(rows.filter((p) => p.status === "failed").length))
      .catch(() => setFailedPayouts(0));
  }, []);

  // Financially-restricted tabs are dropped entirely for Ops/Support, not
  // just disabled — same rule the sidebar and route guards use.
  const visibleTabs = tabs.filter((tab) => canAccessPath(role, tab.href));
  if (visibleTabs.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 border-b border-border">
      {visibleTabs.map((tab) => {
        const isActive = pathname === tab.href;
        const count =
          tab.href === "/payments/refunds"
            ? pendingRefunds
            : tab.href === "/payments/payouts"
              ? failedPayouts
              : 0;
        return (
          <Link
            key={tab.href}
            to={tab.href}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold transition-colors",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {count > 0 ? (
              <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                {count}
              </span>
            ) : null}
            {isActive ? (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
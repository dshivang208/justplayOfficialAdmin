import { useEffect, useState } from "react";
import { CalendarCheck, IndianRupee, Building2, ClipboardList, Users } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { StatCard, StatCardSkeleton } from "@/components/admin/StatCard";
import {
  BookingsTrendChart,
  BookingsTrendChartSkeleton,
} from "@/components/admin/BookingsTrendChart";
import { AlertsPanel, AlertsPanelSkeleton } from "@/components/admin/AlertsPanel";
import { ActivityFeed, ActivityFeedSkeleton } from "@/components/admin/ActivityFeed";
import { summaryMetrics, bookingsTrend, alerts, recentActivity } from "@/data/dashboard";
import { useAdminAuth } from "@/lib/admin-auth";
import { canAccessFinancials, canAccessPath } from "@/lib/permissions";

/** Simulates the initial data fetch so Phase 1 demos the loading state too. */
function useSimulatedLoad(ms = 700) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return loading;
}

const metricPresentation = {
  "bookings-today": { icon: CalendarCheck, tint: "primary" as const },
  "revenue-today": { icon: IndianRupee, tint: "accent" as const },
  "active-venues": { icon: Building2, tint: "info" as const },
  "pending-approvals": { icon: ClipboardList, tint: "accent" as const },
  "active-users": { icon: Users, tint: "primary" as const },
};

export function DashboardPage() {
  const { admin } = useAdminAuth();
  const role = admin?.role ?? "Super Admin";
  const loading = useSimulatedLoad();
  const totalTrend = bookingsTrend.reduce((sum, p) => sum + p.bookings, 0);
  const visibleMetrics = canAccessFinancials(role)
    ? summaryMetrics
    : summaryMetrics.filter((m) => m.id !== "revenue-today");
  const visibleAlerts = alerts.filter((a) => canAccessPath(role, a.href));

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Welcome back, {admin?.name?.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here's what's happening across JustPlay Kanpur today.
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
            : visibleMetrics.map((metric) => {
                const presentation = metricPresentation[metric.id as keyof typeof metricPresentation];
                return (
                  <StatCard
                    key={metric.id}
                    metric={metric}
                    icon={presentation.icon}
                    tint={presentation.tint}
                  />
                );
              })}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Trend chart */}
          <div className="surface-card rounded-xl p-4 lg:col-span-2">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-foreground">
                  Bookings — last 30 days
                </h2>
                <p className="text-xs text-muted-foreground">Platform-wide, all venues</p>
              </div>
              {!loading ? (
                <div className="text-right">
                  <p className="font-display text-lg font-semibold text-foreground">
                    {totalTrend.toLocaleString("en-IN")}
                  </p>
                  <p className="text-[11px] text-muted-foreground">total bookings</p>
                </div>
              ) : null}
            </div>
            {loading ? <BookingsTrendChartSkeleton /> : <BookingsTrendChart data={bookingsTrend} />}
          </div>

          {/* Alerts */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-foreground">
                Action items
              </h2>
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                {visibleAlerts.length} open
              </span>
            </div>
            {loading ? <AlertsPanelSkeleton /> : <AlertsPanel items={visibleAlerts} />}
          </div>
        </div>

        {/* Recent activity */}
        <div className="mt-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Recent activity
            </h2>
            <p className="text-xs text-muted-foreground">Auto-updates across the platform</p>
          </div>
          {loading ? <ActivityFeedSkeleton /> : <ActivityFeed items={recentActivity} />}
        </div>
      </div>
    </AdminShell>
  );
}

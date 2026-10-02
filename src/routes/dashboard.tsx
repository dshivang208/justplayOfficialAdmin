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
import {
  getDashboardSummary,
  getBookingsTrend,
  getDashboardActivity,
  type SummaryMetric,
  type TrendPoint,
  type ActivityItem,
} from "@/lib/admin-data/dashboard";
import { listAdminAlerts, type AlertItem } from "@/lib/admin-data/alerts";
import { useAdminAuth } from "@/lib/admin-auth";
import { canAccessPath } from "@/lib/permissions";

const metricPresentation = {
  "bookings-today": { icon: CalendarCheck, tint: "primary" as const },
  "revenue-today": { icon: IndianRupee, tint: "accent" as const },
  "active-venues": { icon: Building2, tint: "info" as const },
  "pending-approvals": { icon: ClipboardList, tint: "accent" as const },
  "active-users": { icon: Users, tint: "primary" as const },
};

export function DashboardPage() {
  const { admin } = useAdminAuth();
  const role = admin?.role ?? "Ops/Support";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<SummaryMetric[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [alertItems, setAlertItems] = useState<AlertItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    Promise.all([
      getDashboardSummary(role),
      getBookingsTrend(30),
      listAdminAlerts(role),
      getDashboardActivity(8),
    ])
      .then(([summaryData, trendData, alertsData, activityData]) => {
        if (cancelled) return;
        setMetrics(summaryData);
        setTrend(trendData);
        setAlertItems(alertsData);
        setActivity(activityData);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("dashboard load failed:", err);
        setLoadError(err instanceof Error ? err.message : "Could not load the dashboard.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `role` only ever changes with a fresh sign-in (a whole remount), but
    // it's a real dependency of every call above, so it's listed honestly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const totalTrend = trend.reduce((sum, p) => sum + p.bookings, 0);
  const visibleAlerts = alertItems.filter((a) => canAccessPath(role, a.href));

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

        {loadError ? (
          <div className="surface-card rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {loadError}
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
                : metrics.map((metric) => {
                    const presentation =
                      metricPresentation[metric.id as keyof typeof metricPresentation];
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
                {loading ? <BookingsTrendChartSkeleton /> : <BookingsTrendChart data={trend} />}
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
              {loading ? <ActivityFeedSkeleton /> : <ActivityFeed items={activity} />}
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
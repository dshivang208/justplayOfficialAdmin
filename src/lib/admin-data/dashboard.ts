/**
 * Real Dashboard Overview data, replacing src/data/dashboard.ts (mock) —
 * the last screen in this app still showing fixed numbers that never
 * changed no matter what was actually happening. Every other screen
 * (bookings, users, payments, content, venues) was already wired to real
 * data before this.
 *
 * alerts (Action items) was ALSO already real — listAdminAlerts() in
 * ./alerts.ts — the dashboard route just wasn't calling it yet.
 */
import { supabase } from "@/lib/supabaseClient";
import type { AdminRole } from "@/lib/admin-auth";
import { canAccessFinancials } from "@/lib/permissions";
import { countWhereEqual } from "./alerts";

export type SummaryMetric = {
  id: string;
  label: string;
  value: string;
  delta?: string;
  deltaDirection?: "up" | "down";
  hint?: string;
};

export type TrendPoint = { date: string; bookings: number };

export type ActivityType = "booking" | "cancellation" | "venue_signup";

export type ActivityItem = {
  id: string;
  type: ActivityType;
  title: string;
  subtitle: string;
  timestamp: string;
};

function pctDelta(today: number, yesterday: number): { delta: string; direction: "up" | "down" } | null {
  if (yesterday === 0) return today > 0 ? { delta: "new today", direction: "up" } : null;
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  if (pct === 0) return null;
  return { delta: `${pct > 0 ? "+" : ""}${pct}% vs yesterday`, direction: pct > 0 ? "up" : "down" };
}

/** The 5 summary cards. `role` controls whether "Revenue Today" is
 *  included — same client-side rule the dashboard already applied to the
 *  mock (canAccessFinancials), kept rather than tightened, since GMV
 *  itself isn't restricted server-side on admin_dashboard_bookings_trend
 *  either (it matches admin_financial_summary's existing precedent: any
 *  admin role, gated only by is_admin()). */
export async function getDashboardSummary(role: AdminRole): Promise<SummaryMetric[]> {
  const [trend, activeVenues, pendingApprovals, activeUsers, newUsersThisWeek] = await Promise.all([
    getBookingsTrend(2), // just need today + yesterday here
    countWhereEqual("venues", "is_active", true),
    countWhereEqual("venues", "approval_status", "pending"),
    countWhereEqual("users", "status", "active"),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 6 * 86_400_000).toISOString())
      .then(({ count, error }) => {
        if (error) {
          console.error("dashboard: new users this week failed:", error.message);
          return 0;
        }
        return count ?? 0;
      }),
  ]);

  const todayBookings = trend.at(-1)?.bookings ?? 0;
  const yesterdayBookings = trend.at(-2)?.bookings ?? 0;
  const todayGmv = trend.at(-1)?.gmv ?? 0;
  const yesterdayGmv = trend.at(-2)?.gmv ?? 0;

  const bookingsDelta = pctDelta(todayBookings, yesterdayBookings);
  const revenueDelta = pctDelta(todayGmv, yesterdayGmv);

  const metrics: SummaryMetric[] = [
    {
      id: "bookings-today",
      label: "Bookings Today",
      value: todayBookings.toLocaleString("en-IN"),
      ...(bookingsDelta ? { delta: bookingsDelta.delta, deltaDirection: bookingsDelta.direction } : {}),
    },
    {
      id: "revenue-today",
      label: "Revenue Today",
      value: `₹${todayGmv.toLocaleString("en-IN")}`,
      ...(revenueDelta ? { delta: revenueDelta.delta, deltaDirection: revenueDelta.direction } : {}),
    },
    {
      id: "active-venues",
      label: "Active Venues",
      value: activeVenues.toLocaleString("en-IN"),
      hint: "live on the Consumer app",
    },
    {
      id: "pending-approvals",
      label: "Pending Venue Approvals",
      value: pendingApprovals.toLocaleString("en-IN"),
      hint: "awaiting review",
    },
    {
      id: "active-users",
      label: "Active Users",
      value: activeUsers.toLocaleString("en-IN"),
      ...(newUsersThisWeek > 0
        ? { delta: `+${newUsersThisWeek} new this week`, deltaDirection: "up" as const }
        : {}),
    },
  ];

  return canAccessFinancials(role) ? metrics : metrics.filter((m) => m.id !== "revenue-today");
}

type TrendRow = { day: string; bookings: number; gmv: number };

/** Booking count (+ gmv, used internally by getDashboardSummary) per day
 *  for the last `days` days, always including days with zero bookings. */
export async function getBookingsTrend(days = 30): Promise<(TrendPoint & { gmv: number })[]> {
  const { data, error } = await supabase.rpc("admin_dashboard_bookings_trend", { p_days: days });
  if (error) throw new Error(error.message);
  return ((data ?? []) as TrendRow[]).map((row) => ({ date: row.day, bookings: row.bookings, gmv: row.gmv }));
}

type ActivityRow = {
  id: string;
  activity_type: ActivityType;
  title: string;
  subtitle: string;
  happened_at: string;
};

export async function getDashboardActivity(limit = 8): Promise<ActivityItem[]> {
  const { data, error } = await supabase.rpc("admin_dashboard_activity", { p_limit: limit });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ActivityRow[]).map((row) => ({
    id: row.id,
    type: row.activity_type,
    title: row.title,
    subtitle: row.subtitle,
    timestamp: row.happened_at,
  }));
}
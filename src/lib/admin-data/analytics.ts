/**
 * Dashboard analytics — thin typed wrappers over the admin_analytics_* RPCs
 * (see supabase/migrations/20261026000000_admin_analytics.sql). Money fields
 * are `null` for Ops/Support admins; the server decides, not the UI.
 */
import { supabase } from "@/lib/supabaseClient";
import {
  addDays,
  startOfWeek,
  todayIST,
  type Granularity,
  type Period,
} from "./analyticsPeriods";

export type Kpis = {
  bookings: number;
  cancelled: number;
  cancellation_rate: number | null;
  gmv: number | null;
  commission: number | null;
  refunds: number | null;
  avg_booking_value: number | null;
  customers: number;
  new_customers: number;
  returning_customers: number;
  repeat_rate: number | null;
  revenue_per_customer: number | null;
  walk_in_bookings: number;
  online_bookings: number;
  active_venues: number;
  live_venues: number;
  avg_revenue_per_venue: number | null;
  avg_revenue_per_live_venue: number | null;
  bookings_per_venue: number | null;
  utilization_pct: number | null;
  avg_lead_days: number | null;
  new_users: number;
};

export type Overview = {
  can_see_revenue: boolean;
  current: Kpis;
  previous: Kpis;
  prev_from: string;
  prev_to: string;
};

export type SeriesPoint = {
  bucket: string;
  bookings: number;
  cancelled: number;
  gmv: number | null;
  commission: number | null;
  customers: number;
};

export type VenueRow = {
  venue_id: string;
  name: string;
  area: string | null;
  is_active: boolean;
  bookings: number;
  cancelled: number;
  gmv: number | null;
  commission: number | null;
  avg_booking_value: number | null;
  customers: number;
  utilization_pct: number | null;
  rating: number | null;
  review_count: number;
  gmv_share_pct: number | null;
  prev_bookings: number;
  prev_gmv: number | null;
};

export type Breakdown = {
  by_sport: { sport: string; bookings: number; gmv: number | null }[];
  by_weekday: { dow: number; bookings: number }[];
  by_hour: { hour: number; bookings: number }[];
  by_source: { online: number; walk_in: number };
};

export type SportRow = {
  sport: string;
  bookings: number;
  cancelled: number;
  gmv: number | null;
  commission: number | null;
  avg_booking_value: number | null;
  customers: number;
  venues: number;
  utilization_pct: number | null;
  gmv_share_pct: number | null;
  bookings_share_pct: number | null;
  prev_bookings: number;
  prev_gmv: number | null;
};

export type SportSeriesRow = {
  bucket: string;
  sport: string;
  bookings: number;
  gmv: number | null;
};

export type VenueOption = {
  venue_id: string;
  name: string;
  area: string | null;
};

const venueArg = (venue: string | null) => (venue ? venue : null);
const sportArg = (sport: string | null) => (sport ? sport : null);

function fail(error: { message: string }): never {
  if (/could not find the function|does not exist/i.test(error.message)) {
    throw new Error(
      "Analytics isn't set up yet — run supabase/migrations/20261026000000_admin_analytics.sql in the Supabase SQL editor.",
    );
  }
  throw new Error(error.message);
}

export async function getOverview(
  period: Period,
  venue: string | null,
  sport: string | null = null,
): Promise<Overview> {
  const { data, error } = await supabase.rpc("admin_analytics_overview", {
    p_from: period.from,
    p_to: period.to,
    p_venue: venueArg(venue),
    p_sport: sportArg(sport),
  });
  if (error) fail(error);
  return data as Overview;
}

export async function getTimeseries(
  from: string,
  to: string,
  granularity: Granularity,
  venue: string | null,
  sport: string | null = null,
): Promise<SeriesPoint[]> {
  const { data, error } = await supabase.rpc("admin_analytics_timeseries", {
    p_from: from,
    p_to: to,
    p_granularity: granularity,
    p_venue: venueArg(venue),
    p_sport: sportArg(sport),
  });
  if (error) fail(error);
  return (data ?? []) as SeriesPoint[];
}

/** Last `weeks` calendar weeks (Mon–Sun), including the current one. */
export function getWeeklyTrend(
  venue: string | null,
  weeks = 12,
  sport: string | null = null,
): Promise<SeriesPoint[]> {
  const today = todayIST();
  const from = addDays(startOfWeek(today), -(weeks - 1) * 7);
  return getTimeseries(from, today, "week", venue, sport);
}

export async function getVenueRevenue(
  period: Period,
  sport: string | null = null,
): Promise<VenueRow[]> {
  const { data, error } = await supabase.rpc("admin_analytics_venues", {
    p_from: period.from,
    p_to: period.to,
    p_sport: sportArg(sport),
  });
  if (error) fail(error);
  return (data ?? []) as VenueRow[];
}

export async function getBreakdown(
  period: Period,
  venue: string | null,
  sport: string | null = null,
): Promise<Breakdown> {
  const { data, error } = await supabase.rpc("admin_analytics_breakdown", {
    p_from: period.from,
    p_to: period.to,
    p_venue: venueArg(venue),
    p_sport: sportArg(sport),
  });
  if (error) fail(error);
  return data as Breakdown;
}

export async function getSportPerformance(
  period: Period,
  venue: string | null,
): Promise<SportRow[]> {
  const { data, error } = await supabase.rpc("admin_analytics_sports", {
    p_from: period.from,
    p_to: period.to,
    p_venue: venueArg(venue),
  });
  if (error) fail(error);
  return (data ?? []) as SportRow[];
}

export async function getSportSeries(
  period: Period,
  granularity: Granularity,
  venue: string | null,
): Promise<SportSeriesRow[]> {
  const { data, error } = await supabase.rpc("admin_analytics_sport_series", {
    p_from: period.from,
    p_to: period.to,
    p_granularity: granularity,
    p_venue: venueArg(venue),
  });
  if (error) fail(error);
  return (data ?? []) as SportSeriesRow[];
}

export async function getSportOptions(): Promise<string[]> {
  const { data, error } = await supabase.rpc("admin_analytics_sport_options");
  if (error) fail(error);
  return ((data ?? []) as { sport: string }[]).map((r) => r.sport);
}

export async function getVenueOptions(): Promise<VenueOption[]> {
  const { data, error } = await supabase.rpc("admin_analytics_venue_options");
  if (error) fail(error);
  return (data ?? []) as VenueOption[];
}

// ── Formatting ───────────────────────────────────────────────────────────────

const nf = new Intl.NumberFormat("en-IN");
export const fmtInt = (n: number | null | undefined) =>
  n == null ? "—" : nf.format(Math.round(n));

/** ₹ with lakh / crore shortening for big numbers. */
export function fmtInr(n: number | null | undefined, compact = true): string {
  if (n == null) return "—";
  const v = Math.round(n);
  const abs = Math.abs(v);
  if (compact && abs >= 10_000_000)
    return `₹${(v / 10_000_000).toFixed(2).replace(/\.?0+$/, "")} Cr`;
  if (compact && abs >= 100_000)
    return `₹${(v / 100_000).toFixed(2).replace(/\.?0+$/, "")} L`;
  return `₹${nf.format(v)}`;
}
export const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${n.toFixed(1).replace(/\.0$/, "")}%`;

/** % change vs the previous period; null when there's nothing to compare. */
export function pctChange(
  cur: number | null | undefined,
  prev: number | null | undefined,
): number | null {
  if (cur == null || prev == null) return null;
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / prev) * 100;
}

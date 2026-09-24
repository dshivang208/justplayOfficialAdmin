/**
 * Mock data for the Phase 1 Dashboard Overview. Shapes mirror the future
 * API contract (`GET /admin/dashboard/summary`, `/trend`, `/alerts`,
 * `/activity`) so swapping these for real fetches is a one-file change.
 */

export type SummaryMetric = {
  id: string;
  label: string;
  value: string;
  delta?: string;
  deltaDirection?: "up" | "down";
  hint?: string;
};

export const summaryMetrics: SummaryMetric[] = [
  {
    id: "bookings-today",
    label: "Bookings Today",
    value: "184",
    delta: "+12% vs yesterday",
    deltaDirection: "up",
  },
  {
    id: "revenue-today",
    label: "Revenue Today",
    value: "\u20b91,64,320",
    delta: "+8% vs yesterday",
    deltaDirection: "up",
  },
  {
    id: "active-venues",
    label: "Active Venues",
    value: "42",
    hint: "across 9 areas in Kanpur",
  },
  {
    id: "pending-approvals",
    label: "Pending Venue Approvals",
    value: "3",
    hint: "awaiting review",
  },
  {
    id: "active-users",
    label: "Active Users",
    value: "6,214",
    delta: "+2.4% this week",
    deltaDirection: "up",
  },
];

export type TrendPoint = { date: string; bookings: number };

function isoOffset(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/** Deterministic pseudo-random so the chart looks the same on every load. */
function seededWave(i: number, base: number, amplitude: number) {
  const wave = Math.sin(i / 3.2) * amplitude + Math.sin(i / 7) * (amplitude / 2);
  const weekday = new Date(isoOffset(29 - i)).getDay();
  const weekendBoost = weekday === 0 || weekday === 6 ? amplitude * 0.6 : 0;
  return Math.max(20, Math.round(base + wave + weekendBoost));
}

export const bookingsTrend: TrendPoint[] = Array.from({ length: 30 }, (_, i) => ({
  date: isoOffset(29 - i),
  bookings: seededWave(i, 150, 35),
}));

export type AlertSeverity = "critical" | "warning" | "info";

export type AlertItem = {
  id: string;
  message: string;
  severity: AlertSeverity;
  actionLabel: string;
  href: string;
};

export const alerts: AlertItem[] = [
  {
    id: "alert-venue-approvals",
    message: "3 venues pending approval",
    severity: "warning",
    actionLabel: "Review",
    href: "/venues/approvals",
  },
  {
    id: "alert-refunds",
    message: "2 refund requests awaiting review",
    severity: "warning",
    actionLabel: "Review",
    href: "/payments/refunds",
  },
  {
    id: "alert-payout-failed",
    message: "1 partner payout failed",
    severity: "critical",
    actionLabel: "Investigate",
    href: "/payments/payouts",
  },
];

export type ActivityType = "booking" | "cancellation" | "venue_signup";

export type ActivityItem = {
  id: string;
  type: ActivityType;
  title: string;
  subtitle: string;
  timestamp: string;
};

function minutesAgo(mins: number) {
  const d = new Date();
  d.setMinutes(d.getMinutes() - mins);
  return d.toISOString();
}

export const recentActivity: ActivityItem[] = [
  {
    id: "act-1",
    type: "booking",
    title: "New booking — Greenfield Box Cricket Arena",
    subtitle: "Rohan Malhotra \u00b7 Box Cricket \u00b7 \u20b91,600",
    timestamp: minutesAgo(6),
  },
  {
    id: "act-2",
    type: "venue_signup",
    title: "New venue signup — Kidwai Nagar Badminton Court",
    subtitle: "Awaiting document verification",
    timestamp: minutesAgo(24),
  },
  {
    id: "act-3",
    type: "cancellation",
    title: "Booking cancelled — Swaroop Nagar Turf",
    subtitle: "Priya Nair \u00b7 Football \u00b7 refund initiated",
    timestamp: minutesAgo(41),
  },
  {
    id: "act-4",
    type: "booking",
    title: "New booking — Panki Sports Complex",
    subtitle: "Aditya Verma \u00b7 Badminton \u00b7 \u20b9800",
    timestamp: minutesAgo(58),
  },
  {
    id: "act-5",
    type: "booking",
    title: "New booking — Civil Lines Tennis Club",
    subtitle: "Kabir Singh \u00b7 Tennis \u00b7 \u20b91,200",
    timestamp: minutesAgo(73),
  },
  {
    id: "act-6",
    type: "cancellation",
    title: "Booking cancelled — Kalyanpur Futsal Ground",
    subtitle: "Meera Iyer \u00b7 Football \u00b7 outside refund window",
    timestamp: minutesAgo(95),
  },
  {
    id: "act-7",
    type: "venue_signup",
    title: "New venue signup — Yashoda Nagar Pickleball Court",
    subtitle: "Awaiting document verification",
    timestamp: minutesAgo(132),
  },
  {
    id: "act-8",
    type: "booking",
    title: "New booking — Greenfield Box Cricket Arena",
    subtitle: "Simran Kaur \u00b7 Box Cricket \u00b7 \u20b91,600",
    timestamp: minutesAgo(158),
  },
];

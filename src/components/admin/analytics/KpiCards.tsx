import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  CalendarClock,
  Gauge,
  IndianRupee,
  Lock,
  Minus,
  Percent,
  Receipt,
  Repeat,
  RotateCcw,
  Store,
  UserPlus,
  Users,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fmtInr,
  fmtInt,
  fmtPct,
  pctChange,
  type Kpis,
  type Overview,
} from "@/lib/admin-data/analytics";

type Metric = {
  label: string;
  icon: LucideIcon;
  value: (k: Kpis) => string;
  raw: (k: Kpis) => number | null;
  /** "pp" shows a percentage-point difference (for rates), otherwise a % change. */
  delta?: "pct" | "pp";
  /** Whether a rise is good news (cancellations, refunds: no). */
  good?: "up" | "down";
  hint?: (k: Kpis) => string | null;
};

const REVENUE: Metric[] = [
  {
    label: "Revenue (GMV)",
    icon: IndianRupee,
    value: (k) => fmtInr(k.gmv),
    raw: (k) => k.gmv,
    delta: "pct",
    good: "up",
    hint: () => "Paid, confirmed bookings",
  },
  {
    label: "Platform revenue",
    icon: Wallet,
    value: (k) => fmtInr(k.commission),
    raw: (k) => k.commission,
    delta: "pct",
    good: "up",
    hint: () => "JustPlay commission",
  },
  {
    label: "Avg booking value",
    icon: Receipt,
    value: (k) => fmtInr(k.avg_booking_value),
    raw: (k) => k.avg_booking_value,
    delta: "pct",
    good: "up",
  },
  {
    label: "Avg revenue / venue",
    icon: Store,
    value: (k) => fmtInr(k.avg_revenue_per_venue),
    raw: (k) => k.avg_revenue_per_venue,
    delta: "pct",
    good: "up",
    hint: (k) =>
      k.avg_revenue_per_live_venue != null
        ? `${fmtInr(k.avg_revenue_per_live_venue)} across all ${k.live_venues} live venues`
        : "Per venue with bookings",
  },
  {
    label: "Revenue / customer",
    icon: Users,
    value: (k) => fmtInr(k.revenue_per_customer),
    raw: (k) => k.revenue_per_customer,
    delta: "pct",
    good: "up",
  },
  {
    label: "Refunds",
    icon: RotateCcw,
    value: (k) => fmtInr(k.refunds),
    raw: (k) => k.refunds,
    delta: "pct",
    good: "down",
  },
];

const BOOKINGS: Metric[] = [
  {
    label: "Bookings",
    icon: CalendarCheck,
    value: (k) => fmtInt(k.bookings),
    raw: (k) => k.bookings,
    delta: "pct",
    good: "up",
    hint: (k) => `${fmtInt(k.online_bookings)} online · ${fmtInt(k.walk_in_bookings)} walk-in`,
  },
  {
    label: "Cancellation rate",
    icon: XCircle,
    value: (k) => fmtPct(k.cancellation_rate),
    raw: (k) => k.cancellation_rate,
    delta: "pp",
    good: "down",
    hint: (k) => `${fmtInt(k.cancelled)} cancelled`,
  },
  {
    label: "Slot utilisation",
    icon: Gauge,
    value: (k) => fmtPct(k.utilization_pct),
    raw: (k) => k.utilization_pct,
    delta: "pp",
    good: "up",
    hint: () => "Booked ÷ open + booked slots",
  },
  {
    label: "Avg booking lead time",
    icon: CalendarClock,
    value: (k) => (k.avg_lead_days == null ? "—" : `${k.avg_lead_days.toFixed(1).replace(/\.0$/, "")} days`),
    raw: (k) => k.avg_lead_days,
    delta: "pct",
    hint: () => "Booked this far before play",
  },
];

const CUSTOMERS: Metric[] = [
  {
    label: "Customers",
    icon: Users,
    value: (k) => fmtInt(k.customers),
    raw: (k) => k.customers,
    delta: "pct",
    good: "up",
    hint: () => "Unique people who booked",
  },
  {
    label: "New customers",
    icon: UserPlus,
    value: (k) => fmtInt(k.new_customers),
    raw: (k) => k.new_customers,
    delta: "pct",
    good: "up",
    hint: () => "First booking in this period",
  },
  {
    label: "Repeat rate",
    icon: Repeat,
    value: (k) => fmtPct(k.repeat_rate),
    raw: (k) => k.repeat_rate,
    delta: "pp",
    good: "up",
    hint: (k) => `${fmtInt(k.returning_customers)} returning`,
  },
  {
    label: "New sign-ups",
    icon: Percent,
    value: (k) => fmtInt(k.new_users),
    raw: (k) => k.new_users,
    delta: "pct",
    good: "up",
    hint: () => "New accounts created",
  },
];

const VENUES: Metric[] = [
  {
    label: "Active venues",
    icon: Store,
    value: (k) => `${fmtInt(k.active_venues)} / ${fmtInt(k.live_venues)}`,
    raw: (k) => k.active_venues,
    delta: "pct",
    good: "up",
    hint: () => "With bookings · live",
  },
  {
    label: "Bookings / venue",
    icon: CalendarCheck,
    value: (k) => (k.bookings_per_venue == null ? "—" : String(k.bookings_per_venue)),
    raw: (k) => k.bookings_per_venue,
    delta: "pct",
    good: "up",
  },
];

function Delta({ metric, current, previous, compare }: { metric: Metric; current: Kpis; previous: Kpis; compare: string }) {
  if (!metric.delta) return null;
  const a = metric.raw(current);
  const b = metric.raw(previous);
  if (a == null || b == null) return null;

  let change: number | null;
  let text: string;
  if (metric.delta === "pp") {
    change = a - b;
    text = `${change > 0 ? "+" : "−"}${Math.abs(change).toFixed(1)} pp`;
  } else {
    change = pctChange(a, b);
    if (change == null) {
      return (
        <p className="mt-1 text-[11px] font-semibold text-primary" title={`vs ${compare}`}>
          New
        </p>
      );
    }
    const abs = Math.abs(change);
    text = `${change > 0 ? "+" : "−"}${abs >= 100 ? Math.round(abs) : abs.toFixed(1)}%`;
  }

  const flat = Math.abs(change) < 0.05;
  const up = change > 0;
  const good = flat || !metric.good ? null : (up && metric.good === "up") || (!up && metric.good === "down");
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;

  return (
    <p
      className={cn(
        "mt-1 inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] font-semibold",
        good === null ? "text-muted-foreground" : good ? "text-primary" : "text-destructive",
      )}
      title={`vs ${compare}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {flat ? "0%" : text}
    </p>
  );
}

function Group({
  title,
  metrics,
  overview,
  compare,
  className,
}: {
  title: string;
  metrics: Metric[];
  overview: Overview;
  compare: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {metrics.map((m) => {
          const hint = m.hint?.(overview.current);
          return (
            <div key={m.label} className="surface-card rounded-xl p-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{m.label}</p>
                <m.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
              <p className="mt-2 font-display text-xl font-semibold text-foreground sm:text-2xl">
                {m.value(overview.current)}
              </p>
              <Delta metric={m} current={overview.current} previous={overview.previous} compare={compare} />
              {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function KpiCards({ overview, compare }: { overview: Overview; compare: string }) {
  return (
    <div className="space-y-5">
      {overview.can_see_revenue ? (
        <Group title="Revenue" metrics={REVENUE} overview={overview} compare={compare} />
      ) : (
        <div className="surface-card flex items-center gap-2 rounded-xl p-3.5 text-xs text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" />
          Revenue figures are visible to Super Admins only.
        </div>
      )}
      <Group title="Bookings" metrics={BOOKINGS} overview={overview} compare={compare} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Group title="Customers" metrics={CUSTOMERS} overview={overview} compare={compare} className="xl:col-span-2 [&>div]:xl:grid-cols-4" />
        <Group title="Venues" metrics={VENUES} overview={overview} compare={compare} className="[&>div]:xl:grid-cols-2" />
      </div>
    </div>
  );
}

export function KpiCardsSkeleton() {
  return (
    <div className="space-y-5">
      {[6, 4, 4].map((n, i) => (
        <div key={i} className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: n }).map((_, j) => (
            <div key={j} className="surface-card animate-pulse rounded-xl p-3.5">
              <div className="h-3 w-20 rounded bg-muted" />
              <div className="mt-3 h-6 w-16 rounded bg-muted" />
              <div className="mt-3 h-3 w-24 rounded bg-muted" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

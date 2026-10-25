import { useEffect, useMemo, useState } from "react";
import { BarChart3, X } from "lucide-react";
import {
  getBreakdown,
  getOverview,
  getTimeseries,
  getVenueOptions,
  getVenueRevenue,
  getWeeklyTrend,
  type Breakdown,
  type Overview,
  type SeriesPoint,
  type VenueOption,
  type VenueRow,
} from "@/lib/admin-data/analytics";
import {
  compareLabel,
  daysBetween,
  granularityFor,
  periodFor,
  periodLabel,
  todayIST,
  type Period,
} from "@/lib/admin-data/analyticsPeriods";
import { AnalyticsControls } from "./AnalyticsControls";
import { KpiCards, KpiCardsSkeleton } from "./KpiCards";
import {
  ChartsSkeleton,
  HourChart,
  SourceSplit,
  SportMix,
  TrendChart,
  WeekdayChart,
  WeeklyBookingsChart,
} from "./AnalyticsCharts";
import { VenueRevenueTable } from "./VenueRevenueTable";

const msg = (e: unknown) => (e instanceof Error ? e.message : "Could not load analytics.");

export function AnalyticsSection() {
  const [period, setPeriod] = useState<Period>(() => periodFor("month", todayIST()));
  const [venue, setVenue] = useState<string | null>(null);
  const [venues, setVenues] = useState<VenueOption[]>([]);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [venueRows, setVenueRows] = useState<VenueRow[]>([]);
  const [weekly, setWeekly] = useState<SeriesPoint[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const granularity = granularityFor(period);
  const tooBig = daysBetween(period.from, period.to) > 800;

  useEffect(() => {
    getVenueOptions()
      .then(setVenues)
      .catch((e) => console.error("analytics venue options failed:", e));
  }, []);

  // Everything that depends on the period and/or the venue filter.
  useEffect(() => {
    if (tooBig) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getOverview(period, venue),
      getTimeseries(period.from, period.to, granularity, venue),
      getBreakdown(period, venue),
    ])
      .then(([o, s, b]) => {
        if (cancelled) return;
        setOverview(o);
        setSeries(s);
        setBreakdown(b);
      })
      .catch((e) => {
        if (!cancelled) setError(msg(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period, venue, granularity, tooBig]);

  // The venue table always lists every venue for the chosen period.
  useEffect(() => {
    if (tooBig) return;
    let cancelled = false;
    getVenueRevenue(period)
      .then((r) => !cancelled && setVenueRows(r))
      .catch((e) => console.error("analytics venue table failed:", e));
    return () => {
      cancelled = true;
    };
  }, [period, tooBig]);

  // Weekly trend only depends on the venue filter.
  useEffect(() => {
    let cancelled = false;
    getWeeklyTrend(venue, 12)
      .then((w) => !cancelled && setWeekly(w))
      .catch((e) => console.error("analytics weekly trend failed:", e));
    return () => {
      cancelled = true;
    };
  }, [venue]);

  const canSeeRevenue = overview?.can_see_revenue ?? false;
  const venueName = useMemo(() => venues.find((v) => v.venue_id === venue)?.name ?? null, [venues, venue]);
  const compare = compareLabel(period);
  const first = loading && !overview;

  return (
    <section aria-labelledby="analytics-heading" className="mt-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="analytics-heading" className="flex items-center gap-2 font-display text-xl font-semibold text-foreground">
            <BarChart3 className="h-5 w-5 text-primary" /> Performance analytics
          </h2>
          <p className="text-xs text-muted-foreground">
            {venueName ?? "All venues"} · {periodLabel(period)} · compared with the {compare}
          </p>
        </div>
        {venue ? (
          <button
            type="button"
            onClick={() => setVenue(null)}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/15"
          >
            {venueName ?? "Venue"} <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      <div className="surface-card mb-5 rounded-xl p-3">
        <AnalyticsControls period={period} onPeriod={setPeriod} venue={venue} onVenue={setVenue} venues={venues} />
      </div>

      {tooBig ? (
        <div className="surface-card rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Please choose a range of 2 years or less.
        </div>
      ) : error ? (
        <div className="surface-card rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <div className={loading && overview ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={loading}>
          {first || !overview ? <KpiCardsSkeleton /> : <KpiCards overview={overview} compare={compare} />}

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {first ? (
              <>
                <ChartsSkeleton className="h-80 lg:col-span-2" />
                <ChartsSkeleton className="h-80" />
              </>
            ) : (
              <>
                <TrendChart data={series} granularity={granularity} showRevenue={canSeeRevenue} />
                <SportMix data={breakdown?.by_sport ?? []} showRevenue={canSeeRevenue} />
              </>
            )}
          </div>

          <div className="mt-4">
            <WeeklyBookingsChart
              data={weekly}
              selectedFrom={period.kind === "week" ? period.from : null}
              onSelectWeek={(w) => setPeriod(periodFor("week", w))}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            {first ? (
              <>
                <ChartsSkeleton className="h-64" />
                <ChartsSkeleton className="h-64" />
                <ChartsSkeleton className="h-64" />
              </>
            ) : (
              <>
                <WeekdayChart data={breakdown?.by_weekday ?? []} />
                <HourChart data={breakdown?.by_hour ?? []} />
                <SourceSplit data={breakdown?.by_source ?? { online: 0, walk_in: 0 }} />
              </>
            )}
          </div>

          <div className="mt-6">
            <VenueRevenueTable
              rows={venueRows}
              canSeeRevenue={canSeeRevenue}
              selectedVenue={venue}
              onSelectVenue={setVenue}
              periodText={periodLabel(period)}
              fileStem={`${period.from}_to_${period.to}`}
            />
          </div>
        </div>
      )}
    </section>
  );
}

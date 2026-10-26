import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fmtInr,
  fmtInt,
  fmtPct,
  pctChange,
  type SeriesPoint,
  type SportRow,
  type SportSeriesRow,
} from "@/lib/admin-data/analytics";
import {
  addDays,
  bucketLabel,
  fmtDay,
  type Granularity,
} from "@/lib/admin-data/analyticsPeriods";
import { sportColor } from "./sportColors";

const tick = { fontSize: 11, fill: "var(--color-muted-foreground)" };

type Metric = "bookings" | "revenue";

function Growth({ cur, prev }: { cur: number | null; prev: number | null }) {
  const c = pctChange(cur, prev);
  if (c == null)
    return cur && cur > 0 ? (
      <span className="text-[11px] text-primary">new</span>
    ) : null;
  if (Math.abs(c) < 0.5)
    return <span className="text-[11px] text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "text-[11px] font-semibold",
        c > 0 ? "text-primary" : "text-destructive",
      )}
    >
      {c > 0 ? "▲" : "▼"}{" "}
      {Math.abs(c) >= 100 ? Math.round(Math.abs(c)) : Math.abs(c).toFixed(0)}%
    </span>
  );
}

function csvCell(v: string | number | null) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function SportPerformance({
  rows,
  series,
  buckets,
  granularity,
  canSeeRevenue,
  sportOrder,
  selectedSport,
  onSelectSport,
  periodText,
  fileStem,
}: {
  rows: SportRow[];
  series: SportSeriesRow[];
  buckets: SeriesPoint[];
  granularity: Granularity;
  canSeeRevenue: boolean;
  sportOrder: string[];
  selectedSport: string | null;
  onSelectSport: (sport: string | null) => void;
  periodText: string;
  fileStem: string;
}) {
  const [metric, setMetric] = useState<Metric>("bookings");
  const m: Metric = canSeeRevenue ? metric : "bookings";

  const active = useMemo(
    () => rows.filter((r) => r.bookings > 0 || r.cancelled > 0),
    [rows],
  );
  const sportsInChart = useMemo(() => active.map((r) => r.sport), [active]);

  // One row per bucket, one key per sport (stacked bars).
  const data = useMemo(() => {
    const byBucket = new Map<string, Record<string, number | string>>();
    for (const b of buckets) byBucket.set(b.bucket, { bucket: b.bucket });
    for (const r of series) {
      const row = byBucket.get(r.bucket);
      if (row) row[r.sport] = m === "revenue" ? (r.gmv ?? 0) : r.bookings;
    }
    return [...byBucket.values()];
  }, [buckets, series, m]);

  const top = active[0];
  const hasData = active.length > 0;

  const exportCsv = () => {
    const head = [
      "Sport",
      "Bookings",
      "Cancelled",
      ...(canSeeRevenue
        ? [
            "Revenue (INR)",
            "Platform revenue (INR)",
            "Avg booking value (INR)",
            "Revenue share %",
          ]
        : ["Bookings share %"]),
      "Customers",
      "Venues",
      "Utilisation %",
    ];
    const lines = rows.map((r) =>
      [
        r.sport,
        r.bookings,
        r.cancelled,
        ...(canSeeRevenue
          ? [r.gmv, r.commission, r.avg_booking_value, r.gmv_share_pct]
          : [r.bookings_share_pct]),
        r.customers,
        r.venues,
        r.utilization_pct,
      ]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sport-performance-${fileStem}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmtVal = (v: number) =>
    m === "revenue" ? fmtInr(v, false) : fmtInt(v);

  return (
    <div className="surface-card overflow-hidden rounded-xl">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-display text-base font-semibold text-foreground">
            Performance by sport
          </h3>
          <p className="text-xs text-muted-foreground">
            {periodText} · click a sport to filter the whole dashboard to it
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {top && top.bookings > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/20 px-2.5 py-1 text-xs font-semibold text-foreground">
              <Trophy className="h-3.5 w-3.5" /> Top: {top.sport}
            </span>
          ) : null}
          {canSeeRevenue ? (
            <div
              role="tablist"
              aria-label="Chart metric"
              className="inline-flex rounded-lg bg-secondary p-0.5"
            >
              {(["bookings", "revenue"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={metric === k}
                  onClick={() => setMetric(k)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-semibold capitalize transition-colors",
                    metric === k
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>

      {!hasData ? (
        <p className="p-8 text-center text-sm text-muted-foreground">
          No bookings in this period.
        </p>
      ) : (
        <>
          <div className="px-4 pt-4">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data}
                  margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="bucket"
                    tickFormatter={(v: string) => bucketLabel(v, granularity)}
                    tick={tick}
                    interval="preserveStartEnd"
                    minTickGap={24}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={tick}
                    axisLine={false}
                    tickLine={false}
                    width={m === "revenue" ? 52 : 36}
                    allowDecimals={false}
                    tickFormatter={(v: number) =>
                      m === "revenue" ? fmtInr(v) : String(v)
                    }
                  />
                  <Tooltip
                    cursor={{ fill: "var(--color-secondary)", opacity: 0.5 }}
                    content={({ active: on, payload, label }) => {
                      if (!on || !payload?.length) return null;
                      const l = String(label);
                      const title =
                        granularity === "week"
                          ? `${fmtDay(l)} – ${fmtDay(addDays(l, 6), true)}`
                          : granularity === "month"
                            ? bucketLabel(l, "month")
                            : fmtDay(l, true);
                      const items = payload.filter((p) => Number(p.value) > 0);
                      return (
                        <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
                          <p className="mb-1 font-semibold text-popover-foreground">
                            {title}
                          </p>
                          {items.length === 0 ? (
                            <p className="text-muted-foreground">No bookings</p>
                          ) : (
                            items.map((p) => (
                              <p
                                key={String(p.dataKey)}
                                className="flex items-center gap-1.5 text-muted-foreground"
                              >
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ background: p.color }}
                                />
                                {String(p.dataKey)}: {fmtVal(Number(p.value))}
                              </p>
                            ))
                          )}
                        </div>
                      );
                    }}
                  />
                  {sportsInChart.map((sport, i) => (
                    <Bar
                      key={sport}
                      dataKey={sport}
                      stackId="sports"
                      fill={sportColor(sport, sportOrder)}
                      fillOpacity={
                        selectedSport == null || selectedSport === sport
                          ? 1
                          : 0.3
                      }
                      radius={i === sportsInChart.length - 1 ? [4, 4, 0, 0] : 0}
                      maxBarSize={32}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="mb-2 mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {sportsInChart.map((sport) => (
                <li
                  key={sport}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: sportColor(sport, sportOrder) }}
                  />
                  {sport}
                </li>
              ))}
            </ul>
          </div>

          <div className="overflow-x-auto border-t border-border">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="bg-secondary/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Sport</th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    Bookings
                  </th>
                  {canSeeRevenue ? (
                    <th className="px-3 py-2.5 text-right font-semibold">
                      Revenue
                    </th>
                  ) : null}
                  <th className="px-3 py-2.5 font-semibold">
                    {canSeeRevenue ? "Revenue share" : "Booking share"}
                  </th>
                  {canSeeRevenue ? (
                    <th className="px-3 py-2.5 text-right font-semibold">
                      Avg booking
                    </th>
                  ) : null}
                  {canSeeRevenue ? (
                    <th className="px-3 py-2.5 text-right font-semibold">
                      Platform rev.
                    </th>
                  ) : null}
                  <th className="px-3 py-2.5 text-right font-semibold">
                    Customers
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    Venues
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    Utilisation
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    Cancel rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const selected = r.sport === selectedSport;
                  const share = canSeeRevenue
                    ? r.gmv_share_pct
                    : r.bookings_share_pct;
                  const total = r.bookings + r.cancelled;
                  return (
                    <tr
                      key={r.sport}
                      onClick={() => onSelectSport(selected ? null : r.sport)}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-secondary/50",
                        selected && "bg-primary/5 hover:bg-primary/10",
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-2 font-medium text-foreground">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{
                              background: sportColor(r.sport, sportOrder),
                            }}
                          />
                          {r.sport}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <p className="font-medium text-foreground">
                          {fmtInt(r.bookings)}
                        </p>
                        <Growth cur={r.bookings} prev={r.prev_bookings} />
                      </td>
                      {canSeeRevenue ? (
                        <td className="px-3 py-2.5 text-right">
                          <p className="font-medium text-foreground">
                            {fmtInr(r.gmv, false)}
                          </p>
                          <Growth cur={r.gmv} prev={r.prev_gmv} />
                        </td>
                      ) : null}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(share ?? 0, 100)}%`,
                                background: sportColor(r.sport, sportOrder),
                              }}
                            />
                          </div>
                          <span className="w-10 text-xs text-muted-foreground">
                            {fmtPct(share)}
                          </span>
                        </div>
                      </td>
                      {canSeeRevenue ? (
                        <td className="px-3 py-2.5 text-right text-foreground">
                          {fmtInr(r.avg_booking_value, false)}
                        </td>
                      ) : null}
                      {canSeeRevenue ? (
                        <td className="px-3 py-2.5 text-right text-foreground">
                          {fmtInr(r.commission, false)}
                        </td>
                      ) : null}
                      <td className="px-3 py-2.5 text-right text-foreground">
                        {fmtInt(r.customers)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-foreground">
                        {fmtInt(r.venues)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-foreground">
                        {fmtPct(r.utilization_pct)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-foreground">
                        {total > 0 ? fmtPct((100 * r.cancelled) / total) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

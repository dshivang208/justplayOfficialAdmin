import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Breakdown, SeriesPoint } from "@/lib/admin-data/analytics";
import { fmtInr, fmtInt } from "@/lib/admin-data/analytics";
import { addDays, bucketLabel, fmtDay, type Granularity } from "@/lib/admin-data/analyticsPeriods";

const tick = { fontSize: 11, fill: "var(--color-muted-foreground)" };

function Card({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`surface-card rounded-xl p-4 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Empty({ text = "No bookings in this period." }: { text?: string }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
      {text}
    </div>
  );
}

type TipProps = { active?: boolean; payload?: Array<{ payload: SeriesPoint }>; granularity: Granularity };

function SeriesTooltip({ active, payload, granularity }: TipProps) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const title =
    granularity === "week"
      ? `${fmtDay(p.bucket)} – ${fmtDay(addDays(p.bucket, 6), true)}`
      : granularity === "month"
        ? bucketLabel(p.bucket, "month")
        : fmtDay(p.bucket, true);
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-popover-foreground">{title}</p>
      <p className="text-muted-foreground">{fmtInt(p.bookings)} bookings</p>
      {p.cancelled > 0 ? <p className="text-muted-foreground">{fmtInt(p.cancelled)} cancelled</p> : null}
      {p.gmv != null ? <p className="text-muted-foreground">{fmtInr(p.gmv, false)} revenue</p> : null}
    </div>
  );
}

/** Bookings (bars) and revenue (line) across the chosen period. */
export function TrendChart({
  data,
  granularity,
  showRevenue,
}: {
  data: SeriesPoint[];
  granularity: Granularity;
  showRevenue: boolean;
}) {
  const hasData = data.some((d) => d.bookings > 0 || d.cancelled > 0);
  const label = granularity === "day" ? "day" : granularity === "week" ? "week" : "month";
  return (
    <Card
      title="Bookings & revenue"
      subtitle={`By ${label}${showRevenue ? " · bars = bookings, line = revenue" : ""}`}
      className="lg:col-span-2"
    >
      {!hasData ? (
        <Empty />
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: showRevenue ? 0 : 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="bucket"
                tickFormatter={(v: string) => bucketLabel(v, granularity)}
                tick={tick}
                interval="preserveStartEnd"
                minTickGap={24}
                axisLine={false}
                tickLine={false}
              />
              <YAxis yAxisId="b" tick={tick} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
              {showRevenue ? (
                <YAxis
                  yAxisId="r"
                  orientation="right"
                  tick={tick}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={(v: number) => fmtInr(v)}
                />
              ) : null}
              <Tooltip content={<SeriesTooltip granularity={granularity} />} cursor={{ fill: "var(--color-secondary)", opacity: 0.5 }} />
              <Bar yAxisId="b" dataKey="bookings" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              {showRevenue ? (
                <Line
                  yAxisId="r"
                  type="monotone"
                  dataKey="gmv"
                  stroke="var(--color-chart-2)"
                  strokeWidth={2}
                  dot={data.length <= 14}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

/** Last N weeks; clicking a bar opens that week as the active period. */
export function WeeklyBookingsChart({
  data,
  selectedFrom,
  onSelectWeek,
}: {
  data: SeriesPoint[];
  selectedFrom: string | null;
  onSelectWeek: (weekStart: string) => void;
}) {
  const total = data.reduce((s, d) => s + d.bookings, 0);
  const best = data.reduce<SeriesPoint | null>((m, d) => (!m || d.bookings > m.bookings ? d : m), null);
  return (
    <Card
      title="Weekly bookings"
      subtitle={`Last ${data.length} weeks · click a bar to open that week`}
      right={
        <div className="text-right">
          <p className="font-display text-lg font-semibold text-foreground">{fmtInt(total)}</p>
          <p className="text-[11px] text-muted-foreground">
            {best && best.bookings > 0 ? `best: ${fmtDay(best.bucket)} (${best.bookings})` : "bookings"}
          </p>
        </div>
      }
    >
      {total === 0 ? (
        <Empty text="No bookings in these weeks." />
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="bucket"
                tickFormatter={(v: string) => fmtDay(v)}
                tick={tick}
                interval="preserveStartEnd"
                minTickGap={16}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={tick} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
              <Tooltip
                content={<SeriesTooltip granularity="week" />}
                cursor={{ fill: "var(--color-secondary)", opacity: 0.5 }}
              />
              <Bar
                dataKey="bookings"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
                cursor="pointer"
                onClick={(d: { bucket?: string; payload?: SeriesPoint }) => {
                  const b = d.payload?.bucket ?? d.bucket;
                  if (b) onSelectWeek(b);
                }}
              >
                {data.map((d) => (
                  <Cell
                    key={d.bucket}
                    fill="var(--color-chart-1)"
                    fillOpacity={selectedFrom == null || selectedFrom === d.bucket ? 1 : 0.35}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

const SPORT_COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];

export function SportMix({ data, showRevenue }: { data: Breakdown["by_sport"]; showRevenue: boolean }) {
  const total = data.reduce((s, d) => s + d.bookings, 0);
  return (
    <Card title="Sport mix" subtitle="Share of bookings by sport">
      {total === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-3">
          {data.slice(0, 6).map((s, i) => {
            const pct = (s.bookings / total) * 100;
            return (
              <li key={s.sport}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate font-medium text-foreground">{s.sport}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {fmtInt(s.bookings)} · {pct.toFixed(0)}%{showRevenue && s.gmv != null ? ` · ${fmtInr(s.gmv)}` : ""}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(pct, 2)}%`, background: SPORT_COLORS[i % SPORT_COLORS.length] }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function MiniBars({
  data,
  xKey,
  fmtX,
  color,
}: {
  data: Record<string, number>[];
  xKey: string;
  fmtX: (v: number) => string;
  color: string;
}) {
  const max = Math.max(...data.map((d) => d["bookings"] ?? 0));
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey={xKey} tickFormatter={fmtX} tick={tick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis hide allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "var(--color-secondary)", opacity: 0.5 }}
            formatter={(v: number) => [`${v} bookings`, ""]}
            labelFormatter={(v: number) => fmtX(v)}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--color-border)" }}
          />
          <Bar dataKey="bookings" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={color} fillOpacity={max > 0 && (d["bookings"] ?? 0) === max ? 1 : 0.55} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeekdayChart({ data }: { data: Breakdown["by_weekday"] }) {
  const total = data.reduce((s, d) => s + d.bookings, 0);
  const peak = data.reduce((m, d) => (d.bookings > m.bookings ? d : m), data[0] ?? { dow: 0, bookings: 0 });
  return (
    <Card title="Busiest days" subtitle={total > 0 ? `Peak: ${DOW[peak.dow]} (${peak.bookings})` : "By play day"}>
      {total === 0 ? (
        <Empty />
      ) : (
        <MiniBars data={data} xKey="dow" fmtX={(v) => DOW[v] ?? ""} color="var(--color-chart-3)" />
      )}
    </Card>
  );
}

const hourName = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;

export function HourChart({ data }: { data: Breakdown["by_hour"] }) {
  const total = data.reduce((s, d) => s + d.bookings, 0);
  const peak = data.reduce((m, d) => (d.bookings > m.bookings ? d : m), data[0] ?? { hour: 0, bookings: 0 });
  return (
    <Card title="Peak hours" subtitle={total > 0 ? `Peak: ${hourName(peak.hour)} (${peak.bookings})` : "By start time"}>
      {total === 0 ? <Empty /> : <MiniBars data={data} xKey="hour" fmtX={hourName} color="var(--color-chart-2)" />}
    </Card>
  );
}

export function SourceSplit({ data }: { data: Breakdown["by_source"] }) {
  const total = data.online + data.walk_in;
  const online = total ? (data.online / total) * 100 : 0;
  return (
    <Card title="Online vs walk-in" subtitle="Where bookings come from">
      {total === 0 ? (
        <Empty />
      ) : (
        <div className="space-y-4 pt-2">
          <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
            <div className="h-full" style={{ width: `${online}%`, background: "var(--color-chart-1)" }} />
            <div className="h-full" style={{ width: `${100 - online}%`, background: "var(--color-chart-2)" }} />
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-chart-1)" }} /> App bookings
              </dt>
              <dd className="font-display text-xl font-semibold text-foreground">{fmtInt(data.online)}</dd>
              <dd className="text-xs text-muted-foreground">{online.toFixed(0)}%</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-chart-2)" }} /> Walk-in (partner)
              </dt>
              <dd className="font-display text-xl font-semibold text-foreground">{fmtInt(data.walk_in)}</dd>
              <dd className="text-xs text-muted-foreground">{(100 - online).toFixed(0)}%</dd>
            </div>
          </dl>
        </div>
      )}
    </Card>
  );
}

export function ChartsSkeleton({ className = "h-64" }: { className?: string }) {
  return <div className={`surface-card animate-pulse rounded-xl bg-muted/60 ${className}`} />;
}

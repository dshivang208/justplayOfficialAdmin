import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FinancialDay } from "@/lib/admin-data/financials";

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function formatCompactRupees(value: number) {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
  return `₹${value}`;
}

function GmvTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-popover-foreground">{formatDateShort(label ?? "")}</p>
      <p className="text-muted-foreground">₹{payload[0]?.value.toLocaleString("en-IN")} GMV</p>
    </div>
  );
}

export function GmvChart({ data }: { data: FinancialDay[] }) {
  const tickInterval = Math.max(1, Math.floor(data.length / 7));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="gmvFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDateShort}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            interval={tickInterval}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatCompactRupees}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={46}
          />
          <Tooltip content={<GmvTooltip />} />
          <Area
            type="monotone"
            dataKey="gmv"
            stroke="var(--color-chart-1)"
            strokeWidth={2}
            fill="url(#gmvFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ComparisonTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-popover-foreground">{formatDateShort(label ?? "")}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: ₹{p.value.toLocaleString("en-IN")}
        </p>
      ))}
    </div>
  );
}

export function CommissionPayoutsChart({ data }: { data: FinancialDay[] }) {
  const tickInterval = Math.max(1, Math.floor(data.length / 7));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDateShort}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            interval={tickInterval}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatCompactRupees}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={46}
          />
          <Tooltip content={<ComparisonTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
          <Line
            type="monotone"
            dataKey="commission"
            name="Commission earned"
            stroke="var(--color-chart-1)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="payoutsMade"
            name="Payouts made"
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FinancialChartSkeleton() {
  return <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />;
}
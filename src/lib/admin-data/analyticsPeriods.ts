/**
 * Period maths for the dashboard analytics. Everything is plain
 * `YYYY-MM-DD` strings handled through UTC dates, so the browser's own
 * time zone can never shift a week or month boundary. "Today" is Kanpur's
 * (Asia/Kolkata) today, matching how the database buckets bookings.
 * Weeks run Monday–Sunday.
 */
export type PeriodKind = "week" | "month" | "quarter" | "year" | "custom";
export type Granularity = "day" | "week" | "month";
export type Period = { kind: PeriodKind; from: string; to: string };

const DAY_MS = 86_400_000;

export const toDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
};
export const toISO = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => toISO(new Date(toDate(iso).getTime() + n * DAY_MS));
export const daysBetween = (from: string, to: string) =>
  Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS) + 1;

export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function startOfWeek(iso: string): string {
  const dow = (toDate(iso).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(iso, -dow);
}

const lastDayOfMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");

/** The week / month / quarter / year that contains `anchor`. */
export function periodFor(kind: Exclude<PeriodKind, "custom">, anchor: string): Period {
  const d = toDate(anchor);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (kind) {
    case "week": {
      const from = startOfWeek(anchor);
      return { kind, from, to: addDays(from, 6) };
    }
    case "month":
      return { kind, from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(lastDayOfMonth(y, m))}` };
    case "quarter": {
      const q0 = Math.floor(m / 3) * 3;
      return { kind, from: `${y}-${pad(q0 + 1)}-01`, to: `${y}-${pad(q0 + 3)}-${pad(lastDayOfMonth(y, q0 + 2))}` };
    }
    case "year":
      return { kind, from: `${y}-01-01`, to: `${y}-12-31` };
  }
}

/** Previous (-1) or next (+1) period of the same kind. */
export function shiftPeriod(p: Period, dir: -1 | 1): Period {
  if (p.kind === "custom") {
    const len = daysBetween(p.from, p.to);
    return { kind: "custom", from: addDays(p.from, dir * len), to: addDays(p.to, dir * len) };
  }
  const anchor =
    p.kind === "week"
      ? addDays(p.from, dir * 7)
      : p.kind === "year"
        ? `${toDate(p.from).getUTCFullYear() + dir}-06-15`
        : toISO(new Date(Date.UTC(toDate(p.from).getUTCFullYear(), toDate(p.from).getUTCMonth() + dir * (p.kind === "month" ? 1 : 3), 15)));
  return periodFor(p.kind, anchor);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDay = (iso: string, withYear = false) => {
  const d = toDate(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ""}`;
};

export function periodLabel(p: Period): string {
  const f = toDate(p.from);
  const t = toDate(p.to);
  switch (p.kind) {
    case "week":
      return `${fmtDay(p.from)} – ${fmtDay(p.to, true)}`;
    case "month":
      return `${MONTHS[f.getUTCMonth()]} ${f.getUTCFullYear()}`;
    case "quarter":
      return `Q${Math.floor(f.getUTCMonth() / 3) + 1} ${f.getUTCFullYear()} (${MONTHS[f.getUTCMonth()]} – ${MONTHS[t.getUTCMonth()]})`;
    case "year":
      return String(f.getUTCFullYear());
    default:
      return `${fmtDay(p.from, f.getUTCFullYear() !== t.getUTCFullYear())} – ${fmtDay(p.to, true)}`;
  }
}

export const compareLabel = (p: Period) =>
  p.kind === "custom" ? `previous ${daysBetween(p.from, p.to)} days` : `previous ${p.kind}`;

export function granularityFor(p: Period): Granularity {
  const days = daysBetween(p.from, p.to);
  if (p.kind === "year") return "month";
  if (p.kind === "quarter") return "week";
  if (p.kind === "custom") return days <= 45 ? "day" : days <= 200 ? "week" : "month";
  return "day";
}

export function isCurrent(p: Period, today = todayIST()): boolean {
  return p.from <= today && today <= p.to;
}
export const isFuture = (p: Period, today = todayIST()) => p.from > today;

/** Selectable periods, newest first, ending with the one containing today. */
export function recentPeriods(kind: Exclude<PeriodKind, "custom">, today = todayIST()): Period[] {
  const count = { week: 26, month: 24, quarter: 12, year: 5 }[kind];
  const out: Period[] = [periodFor(kind, today)];
  for (let i = 1; i < count; i++) out.push(shiftPeriod(out[i - 1]!, -1));
  return out;
}

/** Bucket label for a chart axis. */
export function bucketLabel(iso: string, g: Granularity): string {
  const d = toDate(iso);
  if (g === "month") return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
  return fmtDay(iso);
}

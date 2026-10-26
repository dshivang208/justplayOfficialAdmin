import { ChevronLeft, ChevronRight, Store, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isCurrent,
  isFuture,
  periodFor,
  periodLabel,
  recentPeriods,
  shiftPeriod,
  todayIST,
  type Period,
  type PeriodKind,
} from "@/lib/admin-data/analyticsPeriods";
import type { VenueOption } from "@/lib/admin-data/analytics";

const KINDS: { id: PeriodKind; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
  { id: "custom", label: "Custom" },
];

const fieldClass =
  "h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-shadow focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30";

export function AnalyticsControls({
  period,
  onPeriod,
  venue,
  onVenue,
  venues,
  sport,
  onSport,
  sports,
}: {
  period: Period;
  onPeriod: (p: Period) => void;
  venue: string | null;
  onVenue: (id: string | null) => void;
  venues: VenueOption[];
  sport: string | null;
  onSport: (s: string | null) => void;
  sports: string[];
}) {
  const today = todayIST();
  const current = isCurrent(period, today) || isFuture(period, today);

  const changeKind = (kind: PeriodKind) => {
    if (kind === period.kind) return;
    if (kind === "custom") onPeriod({ kind, from: period.from, to: period.to });
    else
      onPeriod(
        periodFor(kind, period.kind === "custom" ? period.to : period.from),
      );
  };

  const options =
    period.kind === "custom" ? [] : recentPeriods(period.kind, today);
  if (period.kind !== "custom" && !options.some((o) => o.from === period.from))
    options.push(period);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
      <div
        role="tablist"
        aria-label="Period"
        className="inline-flex w-full rounded-lg bg-secondary p-1 sm:w-auto"
      >
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="tab"
            aria-selected={period.kind === k.id}
            onClick={() => changeKind(k.id)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors sm:flex-none",
              period.kind === k.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {k.label}
          </button>
        ))}
      </div>

      {period.kind === "custom" ? (
        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label="From date"
            value={period.from}
            max={period.to}
            onChange={(e) =>
              e.target.value && onPeriod({ ...period, from: e.target.value })
            }
            className={fieldClass}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            aria-label="To date"
            value={period.to}
            min={period.from}
            onChange={(e) =>
              e.target.value && onPeriod({ ...period, to: e.target.value })
            }
            className={fieldClass}
          />
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label={`Previous ${period.kind}`}
            onClick={() => onPeriod(shiftPeriod(period, -1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <select
            aria-label={`Choose ${period.kind}`}
            value={period.from}
            onChange={(e) => {
              const next = options.find((o) => o.from === e.target.value);
              if (next) onPeriod(next);
            }}
            className={cn(
              fieldClass,
              "min-w-0 flex-1 sm:min-w-[15rem] sm:flex-none",
            )}
          >
            {options.map((o, i) => (
              <option key={o.from} value={o.from}>
                {periodLabel(o)}
                {i === 0 ? " · current" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label={`Next ${period.kind}`}
            disabled={current}
            onClick={() => onPeriod(shiftPeriod(period, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:ml-auto">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 shrink-0 text-muted-foreground" />
          <select
            aria-label="Sport"
            value={sport ?? ""}
            onChange={(e) => onSport(e.target.value || null)}
            className={cn(
              fieldClass,
              "min-w-0 flex-1 sm:min-w-[9rem] sm:flex-none",
            )}
          >
            <option value="">All sports</option>
            {sports.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
          <select
            aria-label="Venue"
            value={venue ?? ""}
            onChange={(e) => onVenue(e.target.value || null)}
            className={cn(
              fieldClass,
              "min-w-0 flex-1 sm:min-w-[14rem] sm:flex-none",
            )}
          >
            <option value="">All venues</option>
            {venues.map((v) => (
              <option key={v.venue_id} value={v.venue_id}>
                {v.name}
                {v.area ? ` — ${v.area}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtInr, fmtInt, fmtPct, pctChange, type VenueRow } from "@/lib/admin-data/analytics";

type SortKey = "name" | "bookings" | "gmv" | "gmv_share_pct" | "avg_booking_value" | "utilization_pct" | "rating" | "commission";

function Growth({ cur, prev }: { cur: number | null; prev: number | null }) {
  const c = pctChange(cur, prev);
  if (c == null) return cur && cur > 0 ? <span className="text-[11px] text-primary">new</span> : null;
  if (Math.abs(c) < 0.5) return <span className="text-[11px] text-muted-foreground">—</span>;
  return (
    <span className={cn("text-[11px] font-semibold", c > 0 ? "text-primary" : "text-destructive")}>
      {c > 0 ? "▲" : "▼"} {Math.abs(c) >= 100 ? Math.round(Math.abs(c)) : Math.abs(c).toFixed(0)}%
    </span>
  );
}

function csvCell(v: string | number | null) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function VenueRevenueTable({
  rows,
  canSeeRevenue,
  selectedVenue,
  onSelectVenue,
  periodText,
  fileStem,
}: {
  rows: VenueRow[];
  canSeeRevenue: boolean;
  selectedVenue: string | null;
  onSelectVenue: (id: string | null) => void;
  periodText: string;
  fileStem: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>(canSeeRevenue ? "gmv" : "bookings");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => `${r.name} ${r.area ?? ""}`.toLowerCase().includes(q)) : rows;
    const sign = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (sortKey === "name") return sign * String(av).localeCompare(String(bv));
      // nulls always sink to the bottom
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sign * ((av as number) - (bv as number));
    });
  }, [rows, query, sortKey, dir]);

  const totals = useMemo(
    () => ({
      bookings: rows.reduce((s, r) => s + r.bookings, 0),
      gmv: rows.reduce((s, r) => s + (r.gmv ?? 0), 0),
      commission: rows.reduce((s, r) => s + (r.commission ?? 0), 0),
    }),
    [rows],
  );

  const sortBy = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(k);
      setDir(k === "name" ? "asc" : "desc");
    }
  };

  const exportCsv = () => {
    const head = ["Venue", "Area", "Bookings", "Cancelled", ...(canSeeRevenue ? ["Revenue (INR)", "Platform revenue (INR)", "Avg booking value (INR)", "Share of revenue %"] : []), "Customers", "Utilisation %", "Rating"];
    const lines = shown.map((r) =>
      [r.name, r.area, r.bookings, r.cancelled, ...(canSeeRevenue ? [r.gmv, r.commission, r.avg_booking_value, r.gmv_share_pct] : []), r.customers, r.utilization_pct, r.rating]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `venue-performance-${fileStem}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const Th = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th scope="col" className={cn("px-3 py-2.5 font-semibold", className)} aria-sort={sortKey === k ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => sortBy(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}
        {sortKey === k ? (
          dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );

  return (
    <div className="surface-card overflow-hidden rounded-xl">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-base font-semibold text-foreground">
            {canSeeRevenue ? "Revenue by venue" : "Bookings by venue"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {periodText} · click a venue to filter the whole dashboard to it
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 6 ? (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search venue…"
                className="h-8 w-40 rounded-lg border border-input bg-background pl-8 pr-2 text-xs outline-none focus-visible:border-primary"
              />
            </div>
          ) : null}
          <button
            type="button"
            onClick={exportCsv}
            disabled={shown.length === 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">No venues yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-secondary/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2.5 font-semibold">#</th>
                <Th k="name">Venue</Th>
                <Th k="bookings" className="text-right">Bookings</Th>
                {canSeeRevenue ? <Th k="gmv" className="text-right">Revenue</Th> : null}
                {canSeeRevenue ? <Th k="gmv_share_pct">Share</Th> : null}
                {canSeeRevenue ? <Th k="avg_booking_value" className="text-right">Avg booking</Th> : null}
                {canSeeRevenue ? <Th k="commission" className="text-right">Platform rev.</Th> : null}
                <Th k="utilization_pct" className="text-right">Utilisation</Th>
                <Th k="rating" className="text-right">Rating</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((r, i) => {
                const selected = r.venue_id === selectedVenue;
                return (
                  <tr
                    key={r.venue_id}
                    onClick={() => onSelectVenue(selected ? null : r.venue_id)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-secondary/50",
                      selected && "bg-primary/5 hover:bg-primary/10",
                    )}
                  >
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-foreground">
                        {r.name}
                        {!r.is_active ? (
                          <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            inactive
                          </span>
                        ) : null}
                      </p>
                      {r.area ? <p className="text-xs text-muted-foreground">{r.area}</p> : null}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <p className="font-medium text-foreground">{fmtInt(r.bookings)}</p>
                      <Growth cur={r.bookings} prev={r.prev_bookings} />
                    </td>
                    {canSeeRevenue ? (
                      <td className="px-3 py-2.5 text-right">
                        <p className="font-medium text-foreground">{fmtInr(r.gmv, false)}</p>
                        <Growth cur={r.gmv} prev={r.prev_gmv} />
                      </td>
                    ) : null}
                    {canSeeRevenue ? (
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(r.gmv_share_pct ?? 0, 100)}%` }} />
                          </div>
                          <span className="w-10 text-xs text-muted-foreground">{fmtPct(r.gmv_share_pct)}</span>
                        </div>
                      </td>
                    ) : null}
                    {canSeeRevenue ? (
                      <td className="px-3 py-2.5 text-right text-foreground">{fmtInr(r.avg_booking_value, false)}</td>
                    ) : null}
                    {canSeeRevenue ? (
                      <td className="px-3 py-2.5 text-right text-foreground">{fmtInr(r.commission, false)}</td>
                    ) : null}
                    <td className="px-3 py-2.5 text-right text-foreground">{fmtPct(r.utilization_pct)}</td>
                    <td className="px-3 py-2.5 text-right text-foreground">
                      {r.rating != null ? (
                        <span className="inline-flex items-center gap-1">
                          <Star className="h-3 w-3 fill-accent text-accent" />
                          {Number(r.rating).toFixed(1)}
                          <span className="text-xs text-muted-foreground">({r.review_count})</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-border bg-secondary/40 text-xs font-semibold text-foreground">
              <tr>
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5">Total · {rows.length} venues</td>
                <td className="px-3 py-2.5 text-right">{fmtInt(totals.bookings)}</td>
                {canSeeRevenue ? <td className="px-3 py-2.5 text-right">{fmtInr(totals.gmv, false)}</td> : null}
                {canSeeRevenue ? <td /> : null}
                {canSeeRevenue ? <td /> : null}
                {canSeeRevenue ? <td className="px-3 py-2.5 text-right">{fmtInr(totals.commission, false)}</td> : null}
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

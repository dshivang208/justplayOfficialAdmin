import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Flag, ListFilter, Loader2 } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { BookingSectionTabs } from "@/components/admin/BookingSectionTabs";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/admin/StatusBadge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listBookings, formatBookingId, type Booking, type BookingStatus } from "@/lib/admin-data/bookings";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const ALL = "all";
const dateRanges = [
  { value: ALL, label: "All time" },
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
] as const;

export function BookingsListPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [venue, setVenue] = useState<string>(ALL);
  const [city, setCity] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [range, setRange] = useState<string>(ALL);
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  useEffect(() => {
    setLoading(true);
    listBookings()
      .then(setBookings)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load bookings."))
      .finally(() => setLoading(false));
  }, []);

  const allVenueNames = useMemo(
    () => Array.from(new Set(bookings.map((b) => b.venueName))).sort(),
    [bookings],
  );
  const allCities = useMemo(
    () => Array.from(new Set(bookings.map((b) => b.city))).sort(),
    [bookings],
  );

  const filtered = useMemo(() => {
    const now = new Date();
    return bookings.filter((b) => {
      if (venue !== ALL && b.venueName !== venue) return false;
      if (city !== ALL && b.city !== city) return false;
      if (status !== ALL && b.bookingStatus !== (status as BookingStatus)) return false;
      if (flaggedOnly && b.flags.length === 0) return false;
      if (range !== ALL) {
        const days = Number(range);
        const bookingDate = new Date(b.date);
        const diffDays = (now.getTime() - bookingDate.getTime()) / 86400000;
        if (diffDays > days || diffDays < -1) return false;
      }
      return true;
    });
  }, [bookings, venue, city, status, range, flaggedOnly]);

  const anyFilterActive = venue !== ALL || city !== ALL || status !== ALL || range !== ALL || flaggedOnly;

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Booking &amp; User Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? "Loading\u2026" : `${bookings.length} bookings across all venues`}
          </p>
        </div>

        <BookingSectionTabs />

        {loadError && (
          <p className="mt-4 text-sm font-medium text-destructive">{loadError}</p>
        )}

        {loading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <ListFilter className="h-3.5 w-3.5" />
                Filter
              </span>
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="Date range" />
                </SelectTrigger>
                <SelectContent>
                  {dateRanges.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={venue} onValueChange={setVenue}>
                <SelectTrigger className="h-8 w-48 text-xs">
                  <SelectValue placeholder="Venue" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All venues</SelectItem>
                  {allVenueNames.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={city} onValueChange={setCity}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue placeholder="City" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All cities</SelectItem>
                  {allCities.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  <SelectItem value="pending">Pending payment</SelectItem>
                  <SelectItem value="confirmed">Upcoming</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="cancelled_refunded">Cancelled &amp; Refunded</SelectItem>
                </SelectContent>
              </Select>

              <button
                type="button"
                onClick={() => setFlaggedOnly((v) => !v)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition-colors ${
                  flaggedOnly
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : "border-border text-muted-foreground hover:border-destructive hover:text-destructive"
                }`}
              >
                <Flag className="h-3.5 w-3.5" />
                Flagged only
              </button>

              {anyFilterActive ? (
                <button
                  type="button"
                  onClick={() => {
                    setVenue(ALL);
                    setCity(ALL);
                    setStatus(ALL);
                    setRange(ALL);
                    setFlaggedOnly(false);
                  }}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Clear filters
                </button>
              ) : null}

              <span className="ml-auto text-xs text-muted-foreground">
                {filtered.length} of {bookings.length} bookings
              </span>
            </div>

            <div className="surface-card mt-3 overflow-hidden rounded-xl">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1 p-10 text-center">
                  <p className="text-sm font-medium text-foreground">No bookings match these filters</p>
                  <p className="text-xs text-muted-foreground">Try clearing a filter to see more results.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Booking</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Venue</TableHead>
                      <TableHead>Date &amp; time</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((b) => (
                      <TableRow key={b.id} className="group">
                        <TableCell>
                          <Link
                            to="/bookings/$bookingId"
                            params={{ bookingId: b.id }}
                            className="font-medium text-foreground hover:text-primary"
                          >
                            {formatBookingId(b.id)}
                          </Link>
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            {b.sport}
                            {b.flags.length > 0 && <Flag className="h-3 w-3 text-destructive" />}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{b.customerName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{b.venueName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(b.date)}
                          <p className="text-xs">{b.time}</p>
                        </TableCell>
                        <TableCell className="text-sm text-foreground">
                          \u20b9{b.amount.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell>
                          <PaymentStatusBadge status={b.paymentStatus} />
                        </TableCell>
                        <TableCell>
                          <BookingStatusBadge status={b.bookingStatus} />
                        </TableCell>
                        <TableCell>
                          <Link
                            to="/bookings/$bookingId"
                            params={{ bookingId: b.id }}
                            className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
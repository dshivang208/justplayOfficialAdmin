import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Loader2, ShieldAlert } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { BookingSectionTabs } from "@/components/admin/BookingSectionTabs";
import { DisputeResolutionBadge } from "@/components/admin/StatusBadge";
import { listBookingFlags, formatBookingId, type EnrichedFlag } from "@/lib/admin-data/bookings";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function DisputeCard({ flag }: { flag: EnrichedFlag }) {
  return (
    <Link
      to="/bookings/$bookingId"
      params={{ bookingId: flag.bookingId }}
      className="surface-card surface-card-hover flex flex-col gap-2 rounded-xl p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{formatBookingId(flag.bookingId)}</p>
          <p className="text-xs text-muted-foreground">
            {flag.venueName} \u00b7 {flag.customerName}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-secondary-foreground">
          {flag.type === "no_show" ? "No-show" : "Dispute"}
        </span>
      </div>
      <p className="line-clamp-2 text-xs text-muted-foreground">{flag.reason}</p>
      <div className="mt-1 flex items-center justify-between">
        {/* Every real flag is raised by a venue partner — see the note in
            admin-data/bookings.ts. */}
        <span className="text-[11px] text-muted-foreground">
          Raised by venue partner \u00b7 {formatDate(flag.date)}
        </span>
        <DisputeResolutionBadge resolution={flag.resolution} />
      </div>
    </Link>
  );
}

export function BookingDisputesPage() {
  const [flags, setFlags] = useState<EnrichedFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    listBookingFlags()
      .then(setFlags)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load the dispute queue."))
      .finally(() => setLoading(false));
  }, []);

  const unresolved = flags.filter((f) => f.resolution === "unresolved");
  const resolved = flags.filter((f) => f.resolution !== "unresolved");

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Booking &amp; User Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? "Loading\u2026"
              : `${unresolved.length} flagged booking${unresolved.length === 1 ? "" : "s"} awaiting review`}
          </p>
        </div>

        <BookingSectionTabs />

        {loadError && <p className="mt-4 text-sm font-medium text-destructive">{loadError}</p>}

        {loading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="mt-5">
              <h2 className="mb-3 inline-flex items-center gap-1.5 font-display text-base font-semibold text-foreground">
                <ShieldAlert className="h-4 w-4 text-destructive" />
                Needs review
              </h2>
              {unresolved.length === 0 ? (
                <div className="surface-card flex flex-col items-center justify-center gap-1 rounded-xl p-10 text-center">
                  <p className="text-sm font-medium text-foreground">Queue is clear</p>
                  <p className="text-xs text-muted-foreground">
                    No disputes or no-shows are waiting on a decision.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {unresolved.map((f) => (
                    <DisputeCard key={f.id} flag={f} />
                  ))}
                </div>
              )}
            </div>

            {resolved.length > 0 ? (
              <div className="mt-8">
                <h2 className="mb-3 font-display text-base font-semibold text-foreground">
                  Recently resolved
                </h2>
                <ul className="surface-card divide-y divide-border overflow-hidden rounded-xl">
                  {resolved.map((f) => (
                    <li key={f.id}>
                      <Link
                        to="/bookings/$bookingId"
                        params={{ bookingId: f.bookingId }}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/60"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">
                            {formatBookingId(f.bookingId)} \u00b7 {f.venueName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {f.resolutionNote ?? f.reason}
                          </p>
                        </div>
                        <DisputeResolutionBadge resolution={f.resolution} />
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </AdminShell>
  );
}
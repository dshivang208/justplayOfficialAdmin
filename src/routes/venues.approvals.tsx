import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Building2 } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { VenueSectionTabs } from "@/components/admin/VenueSectionTabs";
import { Skeleton } from "@/components/ui/skeleton";
import { listVenues, type Venue } from "@/lib/admin-data/venues";
import { listPartners, type Partner } from "@/lib/admin-data/partners";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function VenueApprovalsPage() {
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([listVenues(), listPartners()])
      .then(([v, p]) => {
        if (!active) return;
        setVenues(v);
        setPartners(p);
      })
      .catch((err: Error) => active && setLoadError(err.message));
    return () => {
      active = false;
    };
  }, []);

  const pending = (venues ?? []).filter((v) => v.status === "pending");

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Venue &amp; Partner Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {venues
              ? `${pending.length} venue${pending.length === 1 ? "" : "s"} awaiting approval`
              : "Loading…"}
          </p>
        </div>

        <VenueSectionTabs />

        <div className="mt-4">
          {loadError ? (
            <div className="surface-card rounded-xl p-10 text-center text-sm text-destructive">
              Couldn't load the approval queue: {loadError}
            </div>
          ) : !venues ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="surface-card flex gap-3 rounded-xl p-3.5">
                  <Skeleton className="h-20 w-24 shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : pending.length === 0 ? (
            <div className="surface-card flex flex-col items-center justify-center gap-1 rounded-xl p-12 text-center">
              <p className="text-sm font-medium text-foreground">Queue is clear</p>
              <p className="text-xs text-muted-foreground">No venues are waiting on a decision right now.</p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {pending.map((venue) => {
                const partner = venue.partnerId ? partners.find((p) => p.id === venue.partnerId) : undefined;
                return (
                  <li key={venue.id}>
                    <Link
                      to="/venues/$venueId"
                      params={{ venueId: venue.id }}
                      className="surface-card surface-card-hover flex gap-3 rounded-xl p-3.5"
                    >
                      {venue.images[0] ? (
                        <img
                          src={venue.images[0]}
                          alt=""
                          className="h-20 w-24 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="h-20 w-24 shrink-0 rounded-lg bg-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="truncate text-sm font-semibold text-foreground">
                            {venue.name}
                          </h3>
                          <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning-foreground">
                            Pending
                          </span>
                        </div>
                        <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Building2 className="h-3 w-3" />
                          {partner?.businessName ?? "Unknown partner"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {venue.city} · Submitted {formatDate(venue.submittedDate)}
                        </p>
                        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                          Review application <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

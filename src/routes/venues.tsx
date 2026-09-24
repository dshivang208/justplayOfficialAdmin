import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, ListFilter } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { VenueSectionTabs } from "@/components/admin/VenueSectionTabs";
import { VenueStatusBadge } from "@/components/admin/StatusBadge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { listVenues, type Venue, type VenueStatus } from "@/lib/admin-data/venues";
import { listPartners, type Partner } from "@/lib/admin-data/partners";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const ALL = "all";

function VenuesTableSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function VenuesListPage() {
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [city, setCity] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [sport, setSport] = useState<string>(ALL);

  useEffect(() => {
    let active = true;
    Promise.all([listVenues(), listPartners()])
      .then(([v, p]) => {
        if (!active) return;
        setVenues(v);
        setPartners(p);
      })
      .catch((err: Error) => {
        if (active) setLoadError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);

  const partnerById = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners]);
  const allCities = useMemo(
    () => Array.from(new Set((venues ?? []).map((v) => v.city))).filter(Boolean),
    [venues],
  );
  const allSports = useMemo(
    () => Array.from(new Set((venues ?? []).flatMap((v) => v.sports))).filter(Boolean),
    [venues],
  );

  const filtered = useMemo(() => {
    return (venues ?? []).filter((v) => {
      if (city !== ALL && v.city !== city) return false;
      if (status !== ALL && v.status !== (status as VenueStatus)) return false;
      if (sport !== ALL && !v.sports.includes(sport)) return false;
      return true;
    });
  }, [venues, city, status, sport]);

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Venue &amp; Partner Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {venues ? `${venues.length} venues onboarded across Kanpur` : "Loading venues…"}
          </p>
        </div>

        <VenueSectionTabs />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <ListFilter className="h-3.5 w-3.5" />
            Filter
          </span>
          <Select value={city} onValueChange={setCity}>
            <SelectTrigger className="h-8 w-36 text-xs">
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
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sport} onValueChange={setSport}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="Sport" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All sports</SelectItem>
              {allSports.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {city !== ALL || status !== ALL || sport !== ALL ? (
            <button
              type="button"
              onClick={() => {
                setCity(ALL);
                setStatus(ALL);
                setSport(ALL);
              }}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Clear filters
            </button>
          ) : null}

          {venues ? (
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} of {venues.length} venues
            </span>
          ) : null}
        </div>

        <div className="surface-card mt-3 overflow-hidden rounded-xl">
          {loadError ? (
            <div className="p-10 text-center text-sm text-destructive">
              Couldn't load venues: {loadError}
            </div>
          ) : !venues ? (
            <VenuesTableSkeleton />
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 p-10 text-center">
              <p className="text-sm font-medium text-foreground">No venues match these filters</p>
              <p className="text-xs text-muted-foreground">Try clearing a filter to see more results.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Venue</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Sports</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Onboarded</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((venue) => {
                  const partner = venue.partnerId ? partnerById.get(venue.partnerId) : undefined;
                  return (
                    <TableRow key={venue.id} className="group">
                      <TableCell>
                        <Link
                          to="/venues/$venueId"
                          params={{ venueId: venue.id }}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {venue.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{venue.area}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {partner?.businessName ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{venue.city}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {venue.sports.map((s) => (
                            <span
                              key={s}
                              className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <VenueStatusBadge status={venue.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {venue.onboardedDate ? formatDate(venue.onboardedDate) : "—"}
                      </TableCell>
                      <TableCell>
                        <Link
                          to="/venues/$venueId"
                          params={{ venueId: venue.id }}
                          className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

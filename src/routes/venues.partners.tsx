import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Flag } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { VenueSectionTabs } from "@/components/admin/VenueSectionTabs";
import { PayoutStatusBadge } from "@/components/admin/StatusBadge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { listPartners, type Partner } from "@/lib/admin-data/partners";

export function PartnersListPage() {
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listPartners()
      .then((p) => active && setPartners(p))
      .catch((err: Error) => active && setLoadError(err.message));
    return () => {
      active = false;
    };
  }, []);

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Venue &amp; Partner Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {partners ? `${partners.length} partners registered on the platform` : "Loading partners…"}
          </p>
        </div>

        <VenueSectionTabs />

        <div className="surface-card mt-4 overflow-hidden rounded-xl">
          {loadError ? (
            <div className="p-10 text-center text-sm text-destructive">
              Couldn't load partners: {loadError}
            </div>
          ) : !partners ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : partners.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No partners found. If this looks wrong, `partners` may not be named that in the real
              schema — see the comment at the top of src/lib/admin-data/partners.ts.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Business</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Venues</TableHead>
                  <TableHead>Payout status</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((partner) => (
                  <TableRow key={partner.id} className="group">
                    <TableCell>
                      <Link
                        to="/venues/partners/$partnerId"
                        params={{ partnerId: partner.id }}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {partner.businessName}
                      </Link>
                      {partner.flagged ? (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
                          <Flag className="h-2.5 w-2.5" />
                          Flagged
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{partner.ownerName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{partner.phone}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {partner.venueIds.length}
                    </TableCell>
                    <TableCell>
                      <PayoutStatusBadge status={partner.payoutAccountStatus} />
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/venues/partners/$partnerId"
                        params={{ partnerId: partner.id }}
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
      </div>
    </AdminShell>
  );
}
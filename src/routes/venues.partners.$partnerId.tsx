import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Flag, Mail, Phone, ShieldOff, Users } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/admin/Button";
import { PayoutStatusBadge, VenueStatusBadge } from "@/components/admin/StatusBadge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { getPartner, flagPartner, unflagPartner, type Partner } from "@/lib/admin-data/partners";
import { listVenues, type Venue } from "@/lib/admin-data/venues";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function NotFound() {
  return (
    <AdminShell>
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-foreground">Partner not found</h1>
        <Link to="/venues/partners" className="mt-4 inline-block text-sm font-semibold text-primary">
          ← Back to partners
        </Link>
      </div>
    </AdminShell>
  );
}

function LoadingSkeleton() {
  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-8 w-72" />
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-48 rounded-xl lg:col-span-2" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    </AdminShell>
  );
}

function FlagDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Flag &amp; suspend this partner</DialogTitle>
          <DialogDescription>
            Their venues stay live, but the flag is visible platform-wide for ops and support to
            see. Use this for fraud concerns or unresolved complaints.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="flag-reason">Reason</Label>
          <Textarea
            id="flag-reason"
            className="mt-1.5"
            rows={4}
            placeholder="e.g. Multiple unresolved refund complaints, suspected fake bookings."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={reason.trim().length === 0}
            onClick={() => {
              onConfirm(reason.trim());
              onOpenChange(false);
            }}
          >
            Flag partner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PartnerDetailPage() {
  const { partnerId } = useParams({ from: "/venues/partners/$partnerId" });
  const navigate = useNavigate();

  const [partner, setPartner] = useState<Partner | null | undefined>(undefined);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getPartner(partnerId), listVenues()])
      .then(([p, v]) => {
        if (!active) return;
        setPartner(p);
        setVenues(v);
      })
      .catch((err: Error) => active && setLoadError(err.message));
    return () => {
      active = false;
    };
  }, [partnerId]);

  if (loadError) {
    return (
      <AdminShell>
        <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-destructive">
          Couldn't load this partner: {loadError}
        </div>
      </AdminShell>
    );
  }
  if (partner === undefined) return <LoadingSkeleton />;
  if (partner === null) return <NotFound />;

  const linkedVenues = venues.filter((v) => partner.venueIds.includes(v.id));

  async function handleFlag(reason: string) {
    setBusy(true);
    try {
      await flagPartner(partner!.id, reason);
      setPartner((prev) => (prev ? { ...prev, flagged: true, flagReason: reason } : prev));
      toast.success("Partner flagged for review");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't flag this partner.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnflag() {
    setBusy(true);
    try {
      await unflagPartner(partner!.id);
      setPartner((prev) => (prev ? { ...prev, flagged: false, flagReason: undefined } : prev));
      toast.success("Flag cleared");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't clear the flag.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => navigate({ to: "/venues/partners" })}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to partners
        </button>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
                {partner.businessName}
              </h1>
              {partner.flagged ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-bold text-destructive">
                  <Flag className="h-3 w-3" />
                  Flagged
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Owned by {partner.ownerName} · Joined {formatDate(partner.joinedDate)}
            </p>
          </div>

          <div className="flex gap-2">
            {partner.flagged ? (
              <Button variant="outline" onClick={handleUnflag} disabled={busy}>
                <ShieldOff className="h-4 w-4" />
                Clear flag
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => setFlagOpen(true)} disabled={busy}>
                <Flag className="h-4 w-4" />
                Flag / suspend
              </Button>
            )}
          </div>
        </div>

        {partner.flagged && partner.flagReason ? (
          <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <span className="font-semibold">Flag reason: </span>
            {partner.flagReason}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="surface-card rounded-xl p-5">
              <h2 className="font-display text-base font-semibold text-foreground">
                Linked venues ({linkedVenues.length})
              </h2>
              <ul className="mt-3 divide-y divide-border">
                {linkedVenues.map((venue) => (
                  <li key={venue.id} className="flex items-center justify-between gap-3 py-3">
                    <Link
                      to="/venues/$venueId"
                      params={{ venueId: venue.id }}
                      className="text-sm font-medium text-foreground hover:text-primary"
                    >
                      {venue.name}
                    </Link>
                    <VenueStatusBadge status={venue.status} />
                  </li>
                ))}
                {linkedVenues.length === 0 ? (
                  <li className="py-3 text-sm text-muted-foreground">No venues linked yet.</li>
                ) : null}
              </ul>
            </div>

            <div className="surface-card rounded-xl p-5">
              <h2 className="font-display text-base font-semibold text-foreground">
                Staff members ({partner.staff.length})
              </h2>
              {partner.staff.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No staff members on file. (There's no staff table in the schema this was built
                  against — see src/lib/admin-data/partners.ts if one exists under a different
                  name.)
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {partner.staff.map((member) => (
                    <li key={member.id} className="flex items-center gap-3 py-3">
                      <span className="icon-chip h-8 w-8 bg-secondary text-secondary-foreground">
                        <Users className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.role}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{member.phone}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="surface-card rounded-xl p-5">
              <h2 className="font-display text-base font-semibold text-foreground">
                Business details
              </h2>
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  {partner.phone}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  {partner.email ?? <span className="italic">Not collected</span>}
                </div>
              </div>
            </div>

            <div className="surface-card space-y-3 rounded-xl p-5">
              <h2 className="font-display text-base font-semibold text-foreground">
                Verification
              </h2>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Payout account</span>
                <PayoutStatusBadge status={partner.payoutAccountStatus} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <FlagDialog open={flagOpen} onOpenChange={setFlagOpen} onConfirm={handleFlag} />
    </AdminShell>
  );
}
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, Flag, Landmark, Mail, Phone, ShieldOff, Smartphone, Users } from "lucide-react";
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
import {
  getPartner,
  flagPartner,
  unflagPartner,
  listPartnerPayoutAccounts,
  type Partner,
  type PartnerPayoutAccount,
} from "@/lib/admin-data/partners";
import { useAdminAuth } from "@/lib/admin-auth";
import { canAccessFinancials } from "@/lib/permissions";
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

function maskAccount(n: string) {
  return n.length <= 4 ? n : `${"•".repeat(n.length - 4)}${n.slice(-4)}`;
}

/** Bank/UPI details the venue owner submitted. Super Admin only — the
 *  database policy returns nothing for anyone else, so this also guards
 *  the UI rather than relying on the empty result. */
function PayoutAccountCard({ venueIds }: { venueIds: string[] }) {
  const { admin } = useAdminAuth();
  const allowed = admin ? canAccessFinancials(admin.role) : false;
  const [accounts, setAccounts] = useState<PartnerPayoutAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const key = venueIds.join(",");

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    listPartnerPayoutAccounts(venueIds)
      .then((a) => active && setAccounts(a))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, allowed]);

  return (
    <div className="surface-card space-y-3 rounded-xl p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-semibold text-foreground">Payout account</h2>
        {allowed && accounts && accounts.some((a) => a.method === "bank") ? (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
          >
            {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {reveal ? "Hide" : "Reveal"} number
          </button>
        ) : null}
      </div>
      {!allowed ? (
        <p className="text-sm italic text-muted-foreground">Visible to Super Admins only.</p>
      ) : error ? (
        <p className="text-sm text-destructive">Couldn't load payout details: {error}</p>
      ) : accounts === null ? (
        <Skeleton className="h-16 w-full" />
      ) : accounts.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">No payout details submitted yet.</p>
      ) : (
        accounts.map((a) => (
          <div key={a.venueId} className="space-y-2 text-sm">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              {a.method === "bank" ? <Landmark className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
              {a.method === "bank" ? "Bank account" : "UPI"}
              <span className="ml-auto">
                <PayoutStatusBadge status={a.status} />
              </span>
            </div>
            {a.method === "bank" ? (
              <dl className="space-y-1 text-muted-foreground">
                <div className="flex justify-between gap-4">
                  <dt>Account holder</dt>
                  <dd className="text-right text-foreground">{a.accountHolderName ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Account number</dt>
                  <dd className="text-right font-mono text-foreground">
                    {a.accountNumber ? (reveal ? a.accountNumber : maskAccount(a.accountNumber)) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>IFSC</dt>
                  <dd className="text-right font-mono text-foreground">{a.ifsc ?? "—"}</dd>
                </div>
              </dl>
            ) : (
              <dl className="space-y-1 text-muted-foreground">
                <div className="flex justify-between gap-4">
                  <dt>UPI ID</dt>
                  <dd className="text-right font-mono text-foreground">{a.upiId ?? "—"}</dd>
                </div>
              </dl>
            )}
            <p className="text-xs text-muted-foreground">
              {a.cashfreeLinked ? "Registered with Cashfree" : "Not yet registered with Cashfree"} · updated{" "}
              {formatDate(a.updatedAt)}
            </p>
          </div>
        ))
      )}
    </div>
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

            <PayoutAccountCard venueIds={partner.venueIds} />
          </div>
        </div>
      </div>

      <FlagDialog open={flagOpen} onOpenChange={setFlagOpen} onConfirm={handleFlag} />
    </AdminShell>
  );
}
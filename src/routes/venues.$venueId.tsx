import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronRight,
  IndianRupee,
  MapPin,
  Pencil,
  Phone,
  Power,
  X,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/admin/Button";
import { VenueStatusBadge, PayoutStatusBadge } from "@/components/admin/StatusBadge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  getVenue,
  approveVenue,
  rejectVenue,
  deactivateVenue,
  reactivateVenue,
  setVenueCommission,
  updateVenueDetails,
  type Venue,
} from "@/lib/admin-data/venues";
import { getPartner, type Partner } from "@/lib/admin-data/partners";
import { useAdminAuth } from "@/lib/admin-auth";
import { canAccessFinancials } from "@/lib/permissions";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function NotFound() {
  return (
    <AdminShell>
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-foreground">Venue not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This venue may have been removed. Head back to the venue list.
        </p>
        <Link to="/venues" className="mt-4 inline-block text-sm font-semibold text-primary">
          ← Back to venues
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
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </AdminShell>
  );
}

function RejectDialog({
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
          <DialogTitle>Reject this venue</DialogTitle>
          <DialogDescription>
            The partner will see this reason and can resubmit after making changes.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="reject-reason">Reason for rejection</Label>
          <Textarea
            id="reject-reason"
            className="mt-1.5"
            rows={4}
            placeholder="e.g. Photos don't clearly show the playing surface. Please re-upload."
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
            Confirm rejection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeactivateDialog({
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
          <DialogTitle>Deactivate this venue</DialogTitle>
          <DialogDescription>
            It will be pulled from consumer discovery immediately. No bookings or venue data are
            deleted, and it can be reactivated any time.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="deactivate-reason">Reason (internal note)</Label>
          <Textarea
            id="deactivate-reason"
            className="mt-1.5"
            rows={3}
            placeholder="e.g. Repeated user complaints about ground condition."
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
            Deactivate venue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommissionDialog({
  open,
  onOpenChange,
  currentRate,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentRate: number;
  onConfirm: (rate: number, note: string) => void;
}) {
  const [rate, setRate] = useState(String(currentRate));
  const [note, setNote] = useState("");
  const parsed = Number(rate);
  const isValid = !Number.isNaN(parsed) && parsed >= 0 && parsed <= 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit commission rate</DialogTitle>
          <DialogDescription>
            Overrides the platform default for this venue only. The change is logged below with
            your name and the time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="rate">New rate (%)</Label>
            <Input
              id="rate"
              type="number"
              min={0}
              max={100}
              step={0.5}
              className="mt-1.5"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="rate-note">Note (optional)</Label>
            <Textarea
              id="rate-note"
              className="mt-1.5"
              rows={3}
              placeholder="Why is this rate changing?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!isValid || parsed === currentRate}
            onClick={() => {
              onConfirm(parsed, note.trim());
              onOpenChange(false);
            }}
          >
            Save rate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailsTab({
  venue,
  partner,
  onSave,
}: {
  venue: Venue;
  partner: Partner | null;
  onSave: (updates: Partial<Venue>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(venue.name);
  const [area, setArea] = useState(venue.area);
  const [address, setAddress] = useState(venue.address);
  const [description, setDescription] = useState(venue.description);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateVenueDetails(venue.id, {
        name: name.trim(),
        area: area.trim(),
        address: address.trim(),
        description: description.trim(),
      });
      onSave({ name: name.trim(), area: area.trim(), address: address.trim(), description: description.trim() });
      setEditing(false);
      toast.success("Venue details updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save changes.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setName(venue.name);
    setArea(venue.area);
    setAddress(venue.address);
    setDescription(venue.description);
    setEditing(false);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        {/* Photos */}
        {venue.images.length > 0 ? (
          <div className="surface-card overflow-hidden rounded-xl">
            <div className="grid grid-cols-3 gap-0.5 bg-border">
              {venue.images.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  className={i === 0 ? "col-span-3 h-56 w-full object-cover sm:col-span-2" : "h-56 w-full object-cover sm:col-span-1"}
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* Details */}
        <div className="surface-card rounded-xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-foreground">Venue details</h2>
            {editing ? (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={handleCancel} disabled={saving}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit override
              </Button>
            )}
          </div>

          {editing ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="v-name">Venue name</Label>
                <Input id="v-name" className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="v-area">Area</Label>
                <Input id="v-area" className="mt-1.5" value={area} onChange={(e) => setArea(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="v-address">Full address</Label>
                <Textarea id="v-address" className="mt-1.5" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="v-desc">Description</Label>
                <Textarea id="v-desc" className="mt-1.5" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">
                Editing here overrides what the partner submitted — use this to fix errors on
                their behalf, not for routine updates. Pricing is managed per-sport in
                `venue_pricing` and isn't editable here yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="flex items-start gap-2 text-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{venue.address}</span>
              </div>
              {venue.pricePerHour !== null ? (
                <div className="flex items-center gap-2 text-foreground">
                  <IndianRupee className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>From ₹{venue.pricePerHour.toLocaleString("en-IN")} / hour</span>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {venue.sports.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
                  >
                    {s}
                  </span>
                ))}
              </div>
              {venue.description ? (
                <p className="leading-relaxed text-muted-foreground">{venue.description}</p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Partner card */}
      <div className="space-y-4">
        <div className="surface-card rounded-xl p-5">
          <h2 className="font-display text-base font-semibold text-foreground">Partner</h2>
          {partner ? (
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <p className="font-semibold text-foreground">{partner.businessName}</p>
                <p className="text-xs text-muted-foreground">Owner: {partner.ownerName}</p>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />
                {partner.phone}
              </div>
              <PayoutStatusBadge status={partner.payoutAccountStatus} />
              <Link
                to="/venues/partners/$partnerId"
                params={{ partnerId: partner.id }}
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                View partner profile
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No linked partner on file.</p>
          )}
        </div>

        <div className="surface-card rounded-xl p-5 text-sm">
          <h2 className="font-display text-base font-semibold text-foreground">Timeline</h2>
          <div className="mt-3 space-y-2 text-muted-foreground">
            <div className="flex justify-between">
              <span>Submitted</span>
              <span className="font-medium text-foreground">{formatDate(venue.submittedDate)}</span>
            </div>
            <div className="flex justify-between">
              <span>Onboarded</span>
              <span className="font-medium text-foreground">
                {venue.onboardedDate ? formatDate(venue.onboardedDate) : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommissionTab({
  venue,
  onUpdateRate,
}: {
  venue: Venue;
  onUpdateRate: (rate: number, note: string) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="surface-card rounded-xl p-5 lg:col-span-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Current commission rate
        </p>
        <p className="mt-2 font-display text-3xl font-semibold text-foreground">
          {venue.commissionRate}%
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Applied to every completed booking at this venue.
        </p>
        <Button size="sm" variant="outline" className="mt-4 w-full" onClick={() => setDialogOpen(true)}>
          Edit rate
        </Button>
      </div>

      <div className="lg:col-span-2">
        <h2 className="mb-3 font-display text-base font-semibold text-foreground">Rate history</h2>
        {venue.commissionHistory.length === 0 ? (
          <div className="surface-card flex flex-col items-center justify-center gap-1 rounded-xl p-8 text-center">
            <p className="text-sm font-medium text-foreground">No changes yet</p>
            <p className="text-xs text-muted-foreground">This venue has always been on {venue.commissionRate}%.</p>
          </div>
        ) : (
          <ul className="surface-card divide-y divide-border overflow-hidden rounded-xl">
            {[...venue.commissionHistory].reverse().map((change) => (
              <li key={change.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">
                    {change.previousRate}% → {change.newRate}%
                  </p>
                  <span className="text-xs text-muted-foreground">{formatDate(change.date)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Changed by {change.changedBy}</p>
                {change.note ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">{change.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <CommissionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        currentRate={venue.commissionRate}
        onConfirm={onUpdateRate}
      />
    </div>
  );
}

export function VenueDetailPage() {
  const { admin } = useAdminAuth();
  const canSeeCommission = canAccessFinancials(admin?.role ?? "Super Admin");
  const { venueId } = useParams({ from: "/venues/$venueId" });
  const navigate = useNavigate();

  const [venue, setVenue] = useState<Venue | null | undefined>(undefined); // undefined = loading
  const [partner, setPartner] = useState<Partner | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getVenue(venueId)
      .then(async (v) => {
        if (!active) return;
        setVenue(v);
        if (v?.partnerId) {
          const p = await getPartner(v.partnerId);
          if (active) setPartner(p);
        }
      })
      .catch((err: Error) => active && setLoadError(err.message));
    return () => {
      active = false;
    };
  }, [venueId]);

  if (loadError) {
    return (
      <AdminShell>
        <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-destructive">
          Couldn't load this venue: {loadError}
        </div>
      </AdminShell>
    );
  }
  if (venue === undefined) return <LoadingSkeleton />;
  if (venue === null) return <NotFound />;

  function updateVenueLocal(updates: Partial<Venue>) {
    setVenue((prev) => (prev ? { ...prev, ...updates } : prev));
  }

  async function handleApprove() {
    setBusy(true);
    try {
      const result = await approveVenue(venue!.id);
      updateVenueLocal({ status: "active", onboardedDate: new Date().toISOString().slice(0, 10) });
      toast.success(
        result.partnerUnlocked
          ? `${venue!.name} approved — partner dashboard access unlocked`
          : `${venue!.name} approved`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't approve this venue.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject(reason: string) {
    setBusy(true);
    try {
      await rejectVenue(venue!.id, reason);
      updateVenueLocal({ status: "inactive", rejectionReason: reason });
      toast.success("Venue rejected and partner notified");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reject this venue.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate(reason: string) {
    setBusy(true);
    try {
      await deactivateVenue(venue!.id, reason);
      updateVenueLocal({ status: "inactive", deactivationReason: reason });
      toast.success("Venue deactivated and removed from discovery");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't deactivate this venue.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReactivate() {
    setBusy(true);
    try {
      await reactivateVenue(venue!.id);
      updateVenueLocal({ status: "active", deactivationReason: undefined });
      toast.success("Venue reactivated and visible in discovery again");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reactivate this venue.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRateChange(rate: number, note: string) {
    try {
      await setVenueCommission(venue!.id, rate, note || undefined);
      const change = {
        id: `local-${Date.now()}`,
        date: new Date().toISOString().slice(0, 10),
        previousRate: venue!.commissionRate,
        newRate: rate,
        changedBy: admin?.name ?? "You",
        note: note || undefined,
      };
      updateVenueLocal({ commissionRate: rate, commissionHistory: [...venue!.commissionHistory, change] });
      toast.success(`Commission rate updated to ${rate}%`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the commission rate.");
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => navigate({ to: "/venues" })}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to venues
        </button>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
                {venue.name}
              </h1>
              <VenueStatusBadge status={venue.status} />
            </div>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              {venue.area}, {venue.city}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {venue.status === "pending" ? (
              <>
                <Button variant="outline" onClick={() => setRejectOpen(true)} disabled={busy}>
                  <X className="h-4 w-4" />
                  Reject
                </Button>
                <Button onClick={handleApprove} disabled={busy}>
                  <Check className="h-4 w-4" />
                  Approve venue
                </Button>
              </>
            ) : venue.status === "active" ? (
              <Button variant="outline" onClick={() => setDeactivateOpen(true)} disabled={busy}>
                <Power className="h-4 w-4" />
                Deactivate
              </Button>
            ) : (
              <Button onClick={handleReactivate} disabled={busy}>
                <Power className="h-4 w-4" />
                Reactivate venue
              </Button>
            )}
          </div>
        </div>

        {venue.rejectionReason ? (
          <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <span className="font-semibold">Rejected: </span>
            {venue.rejectionReason}
          </div>
        ) : venue.deactivationReason ? (
          <div className="mt-4 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Deactivation note: </span>
            {venue.deactivationReason}
          </div>
        ) : null}

        <Tabs defaultValue="details" className="mt-6">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            {canSeeCommission ? <TabsTrigger value="commission">Commission</TabsTrigger> : null}
          </TabsList>
          <TabsContent value="details" className="mt-5">
            <DetailsTab venue={venue} partner={partner} onSave={updateVenueLocal} />
          </TabsContent>
          {canSeeCommission ? (
            <TabsContent value="commission" className="mt-5">
              <CommissionTab venue={venue} onUpdateRate={handleRateChange} />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>

      <RejectDialog open={rejectOpen} onOpenChange={setRejectOpen} onConfirm={handleReject} />
      <DeactivateDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        onConfirm={handleDeactivate}
      />
    </AdminShell>
  );
}
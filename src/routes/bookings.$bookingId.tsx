import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  Banknote,
  Calendar,
  Gift,
  IndianRupee,
  Loader2,
  MapPin,
  ShieldCheck,
  User,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/admin/Button";
import {
  BookingStatusBadge,
  PaymentStatusBadge,
  DisputeResolutionBadge,
  FlagTypeBadge,
} from "@/components/admin/StatusBadge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  getBooking,
  cancelBooking,
  refundBookingOverride,
  resolveBookingFlag,
  formatBookingId,
  type Booking,
} from "@/lib/admin-data/bookings";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function NotFound() {
  return (
    <AdminShell>
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-foreground">Booking not found</h1>
        <Link to="/bookings" className="mt-4 inline-block text-sm font-semibold text-primary">
          \u2190 Back to bookings
        </Link>
      </div>
    </AdminShell>
  );
}

function CancelDialog({
  open,
  onOpenChange,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  busy: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this booking</DialogTitle>
          <DialogDescription>
            This is a manual override for support cases \u2014 the slot will be released immediately.
            If it's still within the free-cancellation window and was paid online, it refunds
            automatically, same as a normal cancellation.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="cancel-reason">Reason (internal note)</Label>
          <Textarea
            id="cancel-reason"
            className="mt-1.5"
            rows={3}
            placeholder="e.g. Customer called support \u2014 venue was double-booked."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Back
          </Button>
          <Button
            variant="destructive"
            disabled={reason.trim().length === 0 || busy}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy ? "Cancelling\u2026" : "Cancel booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({
  open,
  onOpenChange,
  maxAmount,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  maxAmount: number;
  busy: boolean;
  onConfirm: (amount: number, reason: string) => void;
}) {
  const [amount, setAmount] = useState(String(maxAmount));
  const [reason, setReason] = useState("");
  const parsed = Number(amount);
  const isValid = !Number.isNaN(parsed) && parsed > 0 && parsed <= maxAmount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue a refund</DialogTitle>
          <DialogDescription>
            Up to the full paid amount of \u20b9{maxAmount.toLocaleString("en-IN")}. This is an
            override \u2014 it goes through even if the booking is already cancelled or outside the
            free-cancellation window.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="refund-amount">Refund amount (\u20b9)</Label>
            <Input
              id="refund-amount"
              type="number"
              min={0}
              max={maxAmount}
              className="mt-1.5"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="refund-reason">Reason</Label>
            <Textarea
              id="refund-reason"
              className="mt-1.5"
              rows={3}
              placeholder="e.g. Venue was unavailable at the booked time."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={!isValid || reason.trim().length === 0 || busy}
            onClick={() => onConfirm(parsed, reason.trim())}
          >
            {busy ? "Processing\u2026" : "Issue refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreditDialog({
  open,
  onOpenChange,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  busy: boolean;
  onConfirm: (amount: number, note: string) => void;
}) {
  const [amount, setAmount] = useState("200");
  const [note, setNote] = useState("");
  const parsed = Number(amount);
  const isValid = !Number.isNaN(parsed) && parsed > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue goodwill credit</DialogTitle>
          <DialogDescription>
            Adds wallet credit to the customer's account without reversing the venue's payout.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="credit-amount">Credit amount (\u20b9)</Label>
            <Input
              id="credit-amount"
              type="number"
              min={0}
              className="mt-1.5"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="credit-note">Note</Label>
            <Textarea
              id="credit-note"
              className="mt-1.5"
              rows={3}
              placeholder="e.g. Goodwill credit for ground condition complaint."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={!isValid || note.trim().length === 0 || busy}
            onClick={() => onConfirm(parsed, note.trim())}
          >
            {busy ? "Issuing\u2026" : "Issue credit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BookingDetailPage() {
  const { bookingId } = useParams({ from: "/bookings/$bookingId" });
  const navigate = useNavigate();

  const [booking, setBooking] = useState<Booking | null | undefined>(undefined);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => getBooking(bookingId).then(setBooking);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  if (booking === undefined) {
    return (
      <AdminShell>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AdminShell>
    );
  }
  if (!booking) return <NotFound />;

  async function handleCancel(reason: string) {
    setBusy(true);
    try {
      await cancelBooking(booking!.id, reason);
      await refresh();
      setCancelOpen(false);
      toast.success("Booking cancelled");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel this booking.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRefund(amount: number, reason: string) {
    setBusy(true);
    try {
      const result = await refundBookingOverride(booking!.id, { reason, refundAmount: amount });
      await refresh();
      setRefundOpen(false);
      if (result.refunded) toast.success(`\u20b9${amount.toLocaleString("en-IN")} refunded to customer`);
      else toast.error(result.refundError ?? "Refund could not be processed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not process this refund.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResolve(flagId: string, resolution: "resolved" | "no_action", note?: string) {
    setBusy(true);
    try {
      await resolveBookingFlag(flagId, resolution, note ? { note } : undefined);
      await refresh();
      toast.success(resolution === "no_action" ? "Marked as no action needed" : "Dispute marked resolved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update this flag.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCredit(flagId: string, amount: number, note: string) {
    setBusy(true);
    try {
      await resolveBookingFlag(flagId, "credit_issued", { note, creditAmount: amount });
      await refresh();
      setCreditOpen(false);
      toast.success(`\u20b9${amount.toLocaleString("en-IN")} goodwill credit issued`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not issue this credit.");
    } finally {
      setBusy(false);
    }
  }

  const unresolvedFlag = booking.flags.find((f) => f.resolution === "unresolved");
  const canCancel = booking.bookingStatus !== "cancelled" && booking.bookingStatus !== "cancelled_refunded";

  return (
    <AdminShell>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => navigate({ to: "/bookings" })}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to bookings
        </button>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
                {formatBookingId(booking.id)}
              </h1>
              <BookingStatusBadge status={booking.bookingStatus} />
              <PaymentStatusBadge status={booking.paymentStatus} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {booking.venueName} \u00b7 {booking.sport}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canCancel ? (
              <Button variant="outline" onClick={() => setCancelOpen(true)}>
                <Ban className="h-4 w-4" />
                Cancel booking
              </Button>
            ) : null}
            {booking.paymentStatus === "paid" ? (
              <Button variant="outline" onClick={() => setRefundOpen(true)}>
                <Banknote className="h-4 w-4" />
                Issue refund
              </Button>
            ) : null}
          </div>
        </div>

        {booking.cancellationReason ? (
          <div className="mt-4 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Cancellation note: </span>
            {booking.cancellationReason}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="surface-card rounded-xl p-5 lg:col-span-2">
            <h2 className="font-display text-base font-semibold text-foreground">Booking details</h2>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center gap-2 text-foreground">
                <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                {booking.customerName}
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                {booking.venueName}, {booking.city}
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                {formatDate(booking.date)} \u00b7 {booking.time}
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <IndianRupee className="h-4 w-4 shrink-0 text-muted-foreground" />
                {booking.amount.toLocaleString("en-IN")}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <Link
              to="/users/$userId"
              params={{ userId: booking.customerId }}
              className="surface-card surface-card-hover block rounded-xl p-5"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Customer
              </p>
              <p className="mt-1.5 text-sm font-semibold text-foreground">{booking.customerName}</p>
              <p className="mt-2 text-xs font-semibold text-primary">View profile \u2192</p>
            </Link>

            {booking.flags.map((flag) => (
              <div key={flag.id} className="surface-card space-y-3 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <FlagTypeBadge type={flag.type} />
                  <DisputeResolutionBadge resolution={flag.resolution} />
                </div>
                <p className="text-sm text-foreground">{flag.reason}</p>
                {/* Every real flag is raised by a venue partner (see
                    partner_flag_booking) — there's no consumer-facing way
                    to raise one yet, unlike the old mock's "raised by
                    consumer" cases. */}
                <p className="text-xs text-muted-foreground">Raised by venue partner</p>
                {flag.resolutionNote ? (
                  <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    {flag.resolutionNote}
                    {flag.creditAmount ? ` (\u20b9${flag.creditAmount})` : ""}
                  </p>
                ) : null}
                {flag.resolution === "unresolved" ? (
                  <div className="flex flex-col gap-2 pt-1">
                    <Button size="sm" disabled={busy} onClick={() => setCreditOpen(true)}>
                      <Gift className="h-3.5 w-3.5" />
                      Issue goodwill credit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => handleResolve(flag.id, "resolved")}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Mark resolved
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => handleResolve(flag.id, "no_action", "Reviewed \u2014 no action taken.")}
                    >
                      No action needed
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <CancelDialog open={cancelOpen} onOpenChange={setCancelOpen} busy={busy} onConfirm={handleCancel} />
      <RefundDialog
        open={refundOpen}
        onOpenChange={setRefundOpen}
        maxAmount={booking.amount}
        busy={busy}
        onConfirm={handleRefund}
      />
      {unresolvedFlag && (
        <CreditDialog
          open={creditOpen}
          onOpenChange={setCreditOpen}
          busy={busy}
          onConfirm={(amount, note) => handleCredit(unresolvedFlag.id, amount, note)}
        />
      )}
    </AdminShell>
  );
}
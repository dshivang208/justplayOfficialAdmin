import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Headset, Loader2, ShieldOff, UserX } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/admin/Button";
import { BookingStatusBadge, UserStatusBadge } from "@/components/admin/StatusBadge";
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
import { getUser, suspendUser, reactivateUser, type AdminUser } from "@/lib/admin-data/users";
import { getBookingsForUser, type Booking } from "@/lib/admin-data/bookings";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function NotFound() {
  return (
    <AdminShell>
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-foreground">User not found</h1>
        <Link to="/users" className="mt-4 inline-block text-sm font-semibold text-primary">
          \u2190 Back to users
        </Link>
      </div>
    </AdminShell>
  );
}

function SuspendDialog({
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
          <DialogTitle>Suspend this account</DialogTitle>
          <DialogDescription>
            The user won't be able to make new bookings until reactivated. Existing bookings are
            unaffected.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="suspend-reason">Reason</Label>
          <Textarea
            id="suspend-reason"
            className="mt-1.5"
            rows={4}
            placeholder="e.g. Repeated no-shows and a disputed damage claim from a partner."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={reason.trim().length === 0 || busy}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy ? "Suspending\u2026" : "Suspend account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UserDetailPage() {
  const { userId } = useParams({ from: "/users/$userId" });
  const navigate = useNavigate();

  const [user, setUser] = useState<AdminUser | null | undefined>(undefined);
  const [bookingHistory, setBookingHistory] = useState<Booking[]>([]);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    Promise.all([getUser(userId), getBookingsForUser(userId)]).then(([u, bookings]) => {
      setUser(u);
      setBookingHistory(bookings);
    });

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (user === undefined) {
    return (
      <AdminShell>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AdminShell>
    );
  }
  if (!user) return <NotFound />;

  async function handleSuspend(reason: string) {
    setBusy(true);
    try {
      await suspendUser(user!.id, reason);
      await refresh();
      setSuspendOpen(false);
      toast.success("Account suspended");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not suspend this account.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReactivate() {
    setBusy(true);
    try {
      await reactivateUser(user!.id);
      await refresh();
      toast.success("Account reactivated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reactivate this account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => navigate({ to: "/users" })}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to users
        </button>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
                {user.name}
              </h1>
              <UserStatusBadge status={user.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {user.phone} \u00b7 Joined {formatDate(user.joinDate)}
            </p>
          </div>

          {user.status === "active" ? (
            <Button variant="destructive" disabled={busy} onClick={() => setSuspendOpen(true)}>
              <UserX className="h-4 w-4" />
              Suspend account
            </Button>
          ) : (
            <Button variant="outline" disabled={busy} onClick={handleReactivate}>
              <ShieldOff className="h-4 w-4" />
              {busy ? "Reactivating\u2026" : "Reactivate account"}
            </Button>
          )}
        </div>

        {user.status === "suspended" && user.suspensionReason ? (
          <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <span className="font-semibold">Suspension reason: </span>
            {user.suspensionReason}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="surface-card rounded-xl p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Total bookings
            </p>
            <p className="mt-2 font-display text-2xl font-semibold text-foreground">
              {user.totalBookings}
            </p>
          </div>
          <div className="surface-card rounded-xl p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Total spend
            </p>
            <p className="mt-2 font-display text-2xl font-semibold text-foreground">
              \u20b9{user.totalSpend.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="surface-card rounded-xl p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Member since
            </p>
            <p className="mt-2 font-display text-2xl font-semibold text-foreground">
              {formatDate(user.joinDate)}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="mb-3 font-display text-base font-semibold text-foreground">
              Booking history
            </h2>
            {bookingHistory.length === 0 ? (
              <div className="surface-card flex flex-col items-center justify-center gap-1 rounded-xl p-8 text-center">
                <p className="text-sm font-medium text-foreground">No bookings yet</p>
              </div>
            ) : (
              <ul className="surface-card divide-y divide-border overflow-hidden rounded-xl">
                {bookingHistory.map((b) => (
                  <li key={b.id}>
                    <Link
                      to="/bookings/$bookingId"
                      params={{ bookingId: b.id }}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/60"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {b.venueName} \u00b7 {b.sport}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(b.date)} \u00b7 \u20b9{b.amount.toLocaleString("en-IN")}
                        </p>
                      </div>
                      <BookingStatusBadge status={b.bookingStatus} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="mb-3 font-display text-base font-semibold text-foreground">
              Support tickets
            </h2>
            <div className="surface-card flex flex-col items-center justify-center gap-2 rounded-xl p-6 text-center">
              <span className="icon-chip h-10 w-10 bg-secondary text-secondary-foreground">
                <Headset className="h-4.5 w-4.5" />
              </span>
              <p className="text-sm font-medium text-foreground">No ticketing system connected</p>
              <p className="text-xs text-muted-foreground">
                Support tickets will show up here once the helpdesk integration is wired in. For
                now, use the booking history for context on any support conversation.
              </p>
            </div>
          </div>
        </div>
      </div>

      <SuspendDialog open={suspendOpen} onOpenChange={setSuspendOpen} busy={busy} onConfirm={handleSuspend} />
    </AdminShell>
  );
}
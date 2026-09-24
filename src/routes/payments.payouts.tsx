import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Zap } from "lucide-react";
import { RequireRole } from "@/components/admin/RequireRole";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/admin/Button";
import { PaymentSectionTabs } from "@/components/admin/PaymentSectionTabs";
import { PayoutRunStatusBadge } from "@/components/admin/StatusBadge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  listPayouts,
  listPendingPayouts,
  listPendingDeductions,
  triggerPayout,
  retryPayout,
  type Payout,
  type PendingPayout,
  type Deduction,
} from "@/lib/admin-data/payouts";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

type ConfirmAction =
  | { type: "trigger"; venueId: string; venueName: string; amount: number }
  | { type: "retry"; payoutId: string; venueName: string; amount: number };

function PayoutOversightPageContent() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [pending, setPending] = useState<PendingPayout[]>([]);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    Promise.all([listPayouts(), listPendingPayouts(), listPendingDeductions()]).then(
      ([p, pend, ded]) => {
        setPayouts(p);
        setPending(pend);
        setDeductions(ded);
      },
    );

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load payouts."))
      .finally(() => setLoading(false));
  }, []);

  async function handleConfirm() {
    if (!confirmAction) return;
    setBusy(true);
    try {
      const result =
        confirmAction.type === "trigger"
          ? await triggerPayout(confirmAction.venueId)
          : await retryPayout(confirmAction.payoutId);

      await refresh();
      if (result.error) toast.error(result.error);
      else if (result.skipped) toast.error(result.skipped);
      else toast.success(`\u20b9${(result.amount ?? 0).toLocaleString("en-IN")} sent to ${confirmAction.venueName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not process this payout.");
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Payments, Payouts &amp; Refunds
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? "Loading\u2026" : `${payouts.length} payout batches across all venues`}
          </p>
        </div>

        <PaymentSectionTabs />

        {loadError && <p className="mt-4 text-sm font-medium text-destructive">{loadError}</p>}

        {loading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="mt-4">
              <h2 className="mb-1 font-display text-base font-semibold text-foreground">
                Pending &mdash; not yet run
              </h2>
              <p className="mb-3 text-xs text-muted-foreground">
                What each venue is currently owed, computed live from confirmed/paid bookings not yet
                included in a payout.
              </p>
              {pending.length === 0 ? (
                <div className="surface-card flex flex-col items-center justify-center gap-1 rounded-xl p-6 text-center">
                  <p className="text-sm font-medium text-foreground">Nothing pending right now</p>
                </div>
              ) : (
                <div className="surface-card overflow-hidden rounded-xl">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Venue</TableHead>
                        <TableHead>Pending amount</TableHead>
                        <TableHead>Payout account</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pending.map((p) => (
                        <TableRow key={p.venueId}>
                          <TableCell className="font-medium text-foreground">{p.venueName}</TableCell>
                          <TableCell className="text-sm text-foreground">
                            \u20b9{p.pendingNet.toLocaleString("en-IN")}
                            {p.pendingDeductions > 0 ? (
                              <p className="text-xs text-destructive">
                                \u2212\u20b9{p.pendingDeductions.toLocaleString("en-IN")} deductions applied
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {p.verificationStatus === "verified"
                              ? `Verified \u00b7 ${p.payoutMethod}`
                              : p.verificationStatus
                                ? "Not yet verified"
                                : "Not linked"}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={p.verificationStatus !== "verified" || p.pendingNet <= 0}
                                onClick={() =>
                                  setConfirmAction({
                                    type: "trigger",
                                    venueId: p.venueId,
                                    venueName: p.venueName,
                                    amount: p.pendingNet,
                                  })
                                }
                              >
                                <Zap className="h-3.5 w-3.5" />
                                Trigger now
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div className="mt-8">
              <h2 className="mb-3 font-display text-base font-semibold text-foreground">
                Payout history
              </h2>
              <div className="surface-card overflow-hidden rounded-xl">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Venue</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <span className="font-medium text-foreground">{p.venueName}</span>
                        </TableCell>
                        <TableCell className="text-sm text-foreground">
                          \u20b9{p.amount.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.method}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(p.payoutDate)}
                        </TableCell>
                        <TableCell>
                          <PayoutRunStatusBadge status={p.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            {p.status === "failed" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setConfirmAction({
                                    type: "retry",
                                    payoutId: p.id,
                                    venueName: p.venueName,
                                    amount: p.amount,
                                  })
                                }
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                Retry
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="mt-8">
              <h2 className="mb-1 font-display text-base font-semibold text-foreground">
                Pending deductions
              </h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Post-refund clawbacks queued for each venue's next payout batch.
              </p>
              {deductions.length === 0 ? (
                <div className="surface-card flex flex-col items-center justify-center gap-1 rounded-xl p-8 text-center">
                  <p className="text-sm font-medium text-foreground">No deductions queued</p>
                </div>
              ) : (
                <ul className="surface-card divide-y divide-border overflow-hidden rounded-xl">
                  {deductions.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {d.venueName} \u00b7 Booking {d.bookingId}
                        </p>
                        <p className="text-xs text-muted-foreground">{d.reason}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Queued {formatDate(d.createdAt)} \u00b7 applies to their next payout
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-destructive">
                        \u2212\u20b9{d.amount.toLocaleString("en-IN")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      <AlertDialog open={confirmAction !== null} onOpenChange={(v) => !v && !busy && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "retry" ? "Retry this payout?" : "Trigger this payout now?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction
                ? `\u20b9${confirmAction.amount.toLocaleString("en-IN")} for ${confirmAction.venueName} will be sent to Cashfree immediately.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={busy}>
              {busy ? "Processing\u2026" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminShell>
  );
}

export function PayoutOversightPage() {
  return (
    <RequireRole path="/payments/payouts" note="Payout data is restricted to Super Admin.">
      <PayoutOversightPageContent />
    </RequireRole>
  );
}
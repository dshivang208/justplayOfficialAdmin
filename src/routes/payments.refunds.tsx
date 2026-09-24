import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/admin/Button";
import { PaymentSectionTabs } from "@/components/admin/PaymentSectionTabs";
import { RefundRequestStatusBadge } from "@/components/admin/StatusBadge";
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
import { listRefundRequests, reviewRefundRequest, type RefundRequest } from "@/lib/admin-data/refunds";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function ReviewDialog({
  action,
  onOpenChange,
  busy,
  onConfirm,
}: {
  action: { type: "approve" | "reject"; request: RefundRequest } | null;
  onOpenChange: (v: boolean) => void;
  busy: boolean;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const isApprove = action?.type === "approve";

  return (
    <Dialog open={action !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isApprove ? "Approve this refund" : "Reject this refund"}</DialogTitle>
          <DialogDescription>
            {isApprove
              ? "This triggers the real Razorpay refund flow for the customer's original payment method."
              : "The customer will not be refunded. Let them know why so support can follow up if needed."}
          </DialogDescription>
        </DialogHeader>
        {action ? (
          <div className="py-2">
            <Label htmlFor="review-note">{isApprove ? "Note (optional)" : "Reason for rejection"}</Label>
            <Textarea
              id="review-note"
              className="mt-1.5"
              rows={3}
              placeholder={isApprove ? "Any context worth keeping on record." : "e.g. Session was completed as scheduled."}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={isApprove ? "primary" : "destructive"}
            disabled={(!isApprove && note.trim().length === 0) || busy}
            onClick={() => onConfirm(note.trim())}
          >
            {busy ? "Processing\u2026" : isApprove ? "Approve refund" : "Confirm rejection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RefundQueuePage() {
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [action, setAction] = useState<{ type: "approve" | "reject"; request: RefundRequest } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const refresh = () => listRefundRequests().then(setRequests);

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load refund requests."))
      .finally(() => setLoading(false));
  }, []);

  async function handleReview(note: string) {
    if (!action) return;
    setBusy(true);
    try {
      const result = await reviewRefundRequest(
        action.request,
        action.type === "approve" ? "approved" : "rejected",
        note,
      );
      await refresh();
      setAction(null);
      if (action.type === "approve") {
        toast.success(
          result.refunded
            ? `Refund approved \u2014 Razorpay refund sent for ${action.request.id}`
            : "Approved, but the refund itself couldn't be processed automatically \u2014 check the booking.",
        );
      } else {
        toast.success(`Refund request rejected`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not process this review.");
    } finally {
      setBusy(false);
    }
  }

  const pending = requests.filter((r) => r.status === "pending");
  const reviewed = requests.filter((r) => r.status !== "pending");

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Payments, Payouts &amp; Refunds
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? "Loading\u2026"
              : `${pending.length} refund request${pending.length === 1 ? "" : "s"} awaiting review`}
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
            <div className="mt-5">
              {pending.length === 0 ? (
                <div className="surface-card flex flex-col items-center justify-center gap-1 rounded-xl p-10 text-center">
                  <p className="text-sm font-medium text-foreground">Queue is clear</p>
                  <p className="text-xs text-muted-foreground">
                    No refund requests are waiting on a decision.
                  </p>
                </div>
              ) : (
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {pending.map((r) => (
                    <li key={r.id} className="surface-card rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {r.venueName} \u00b7 {r.customerName}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Requested by {r.requestedBy}</p>
                        </div>
                        <span className="shrink-0 font-display text-lg font-semibold text-foreground">
                          \u20b9{r.amount.toLocaleString("en-IN")}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{r.reason}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Requested {formatDate(r.requestedAt)}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAction({ type: "reject", request: r })}
                        >
                          <X className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                        <Button size="sm" onClick={() => setAction({ type: "approve", request: r })}>
                          <Check className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {reviewed.length > 0 ? (
              <div className="mt-8">
                <h2 className="mb-3 font-display text-base font-semibold text-foreground">
                  Recently reviewed
                </h2>
                <ul className="surface-card divide-y divide-border overflow-hidden rounded-xl">
                  {reviewed.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {r.customerName} \u00b7 \u20b9{r.amount.toLocaleString("en-IN")}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.reviewNote ?? r.reason}
                        </p>
                      </div>
                      <RefundRequestStatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>

      <ReviewDialog
        action={action}
        onOpenChange={(v) => !v && !busy && setAction(null)}
        busy={busy}
        onConfirm={handleReview}
      />
    </AdminShell>
  );
}
import { cn } from "@/lib/utils";

type Tone = "primary" | "warning" | "critical" | "muted";

const toneClasses: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  warning: "bg-warning/15 text-warning-foreground",
  critical: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        toneClasses[tone],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function VenueStatusBadge({ status }: { status: "pending" | "active" | "inactive" }) {
  if (status === "active") return <StatusPill label="Active" tone="primary" />;
  if (status === "pending") return <StatusPill label="Pending" tone="warning" />;
  return <StatusPill label="Inactive" tone="muted" />;
}

export function KycStatusBadge({ status }: { status: "verified" | "pending" | "rejected" }) {
  if (status === "verified") return <StatusPill label="KYC Verified" tone="primary" />;
  if (status === "pending") return <StatusPill label="KYC Pending" tone="warning" />;
  return <StatusPill label="KYC Rejected" tone="critical" />;
}

export function PayoutStatusBadge({
  status,
}: {
  status: "verified" | "pending" | "failed" | "not_linked";
}) {
  if (status === "verified") return <StatusPill label="Payout Verified" tone="primary" />;
  if (status === "pending") return <StatusPill label="Payout Pending" tone="warning" />;
  if (status === "failed") return <StatusPill label="Payout Verification Failed" tone="critical" />;
  return <StatusPill label="Not Linked" tone="critical" />;
}

export function BookingStatusBadge({
  status,
}: {
  status: "pending" | "confirmed" | "completed" | "cancelled" | "cancelled_refunded";
}) {
  if (status === "completed") return <StatusPill label="Completed" tone="primary" />;
  if (status === "confirmed") return <StatusPill label="Upcoming" tone="primary" />;
  if (status === "pending") return <StatusPill label="Pending payment" tone="warning" />;
  if (status === "cancelled_refunded") return <StatusPill label="Cancelled & Refunded" tone="muted" />;
  return <StatusPill label="Cancelled" tone="muted" />;
}

/** A no-show or dispute is orthogonal to bookingStatus — see the note on
 *  the real Booking type in admin-data/bookings.ts. */
export function FlagTypeBadge({ type }: { type: "no_show" | "dispute" }) {
  if (type === "no_show") return <StatusPill label="No-show" tone="warning" />;
  return <StatusPill label="Dispute" tone="critical" />;
}

export function PaymentStatusBadge({
  status,
}: {
  status: "paid" | "refunded" | "failed" | "pending";
}) {
  if (status === "paid") return <StatusPill label="Paid" tone="primary" />;
  if (status === "pending") return <StatusPill label="Pending" tone="warning" />;
  if (status === "refunded") return <StatusPill label="Refunded" tone="muted" />;
  return <StatusPill label="Failed" tone="critical" />;
}

export function UserStatusBadge({ status }: { status: "active" | "suspended" }) {
  if (status === "active") return <StatusPill label="Active" tone="primary" />;
  return <StatusPill label="Suspended" tone="critical" />;
}

export function DisputeResolutionBadge({
  resolution,
}: {
  resolution: "unresolved" | "resolved" | "credit_issued" | "no_action";
}) {
  if (resolution === "unresolved") return <StatusPill label="Needs review" tone="warning" />;
  if (resolution === "credit_issued") return <StatusPill label="Credit issued" tone="primary" />;
  if (resolution === "no_action") return <StatusPill label="No action taken" tone="muted" />;
  return <StatusPill label="Resolved" tone="primary" />;
}

export function TransactionStatusBadge({
  status,
}: {
  status: "success" | "failed" | "pending";
}) {
  if (status === "success") return <StatusPill label="Success" tone="primary" />;
  if (status === "pending") return <StatusPill label="Pending" tone="warning" />;
  return <StatusPill label="Failed" tone="critical" />;
}

export function ReconciliationBadge({
  status,
}: {
  status: "matched" | "mismatch" | "pending";
}) {
  if (status === "matched") return <StatusPill label="Matched" tone="primary" />;
  if (status === "pending") return <StatusPill label="Pending" tone="warning" />;
  return <StatusPill label="Mismatch" tone="critical" />;
}

export function PayoutRunStatusBadge({
  status,
}: {
  status: "processing" | "completed" | "failed";
}) {
  if (status === "completed") return <StatusPill label="Completed" tone="primary" />;
  if (status === "processing") return <StatusPill label="Processing" tone="warning" />;
  return <StatusPill label="Failed" tone="critical" />;
}

export function RefundRequestStatusBadge({
  status,
}: {
  status: "pending" | "approved" | "rejected";
}) {
  if (status === "approved") return <StatusPill label="Approved" tone="primary" />;
  if (status === "pending") return <StatusPill label="Awaiting review" tone="warning" />;
  return <StatusPill label="Rejected" tone="critical" />;
}
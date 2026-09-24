/**
 * Real Supabase-backed refund request queue for Backend Phase D,
 * replacing src/data/refunds.ts (mock).
 *
 * SCOPE NOTE, worth knowing: there is no consumer- or partner-facing flow
 * ANYWHERE in this platform yet that creates a refund_requests row —
 * refunds happen either instantly (self-service, inside the free-
 * cancellation window) or via the admin's own direct override (Backend
 * Phase C's "Issue refund" on a booking). This queue and
 * createRefundRequest exist so support can log a request that deserves a
 * deliberate second look (phoned-in, or policy-borderline) — it will
 * legitimately show zero rows until some real flow submits to it. That's
 * the honest state, not a bug.
 *
 * Approval triggers the SAME shared cancel-booking-refund Edge Function
 * every refund in the platform goes through — reviewRefundRequest below
 * calls admin_review_refund_request (the paper trail) and, on approval,
 * separately calls that function with admin_override (the actual money
 * movement), exactly like Phase C's manual refund override does.
 */
import { supabase } from "@/lib/supabaseClient";

export type RefundRequestStatus = "pending" | "approved" | "rejected";

export type RefundRequest = {
  id: string;
  bookingId: string;
  venueName: string;
  customerName: string;
  amount: number;
  reason: string;
  requestedBy: string;
  status: RefundRequestStatus;
  reviewNote: string | null;
  requestedAt: string;
  reviewedAt: string | null;
};

type RequestRow = {
  id: string;
  booking_id: string;
  amount: number;
  reason: string;
  requested_by: string;
  status: RefundRequestStatus;
  review_note: string | null;
  requested_at: string;
  reviewed_at: string | null;
  bookings: { venues: { name: string } | null; users: { name: string } | null } | null;
};

export async function listRefundRequests(): Promise<RefundRequest[]> {
  const { data, error } = await supabase
    .from("refund_requests")
    .select(
      "id, booking_id, amount, reason, requested_by, status, review_note, requested_at, reviewed_at, bookings(venues(name), users(name))",
    )
    .order("requested_at", { ascending: false })
    .returns<RequestRow[]>();
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    bookingId: row.booking_id,
    venueName: row.bookings?.venues?.name ?? "Unknown venue",
    customerName: row.bookings?.users?.name ?? "Unknown customer",
    amount: row.amount,
    reason: row.reason,
    requestedBy: row.requested_by,
    status: row.status,
    reviewNote: row.review_note,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
  }));
}

export async function createRefundRequest(input: {
  bookingId: string;
  amount: number;
  reason: string;
  requestedBy: string;
}) {
  const { data, error } = await supabase.rpc("admin_create_refund_request", {
    p_booking_id: input.bookingId,
    p_amount: input.amount,
    p_reason: input.reason,
    p_requested_by: input.requestedBy,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function reviewRefundRequest(
  request: RefundRequest,
  decision: "approved" | "rejected",
  note?: string,
) {
  const { error: reviewError } = await supabase.rpc("admin_review_refund_request", {
    p_request_id: request.id,
    p_status: decision,
    p_note: note ?? null,
  });
  if (reviewError) throw new Error(reviewError.message);

  if (decision !== "approved") return { refunded: false };

  const { data, error: refundError } = await supabase.functions.invoke<{
    refunded: boolean;
    refundError?: string;
  }>("cancel-booking-refund", {
    body: {
      booking_id: request.bookingId,
      reason: note || request.reason,
      admin_override: { refundAmount: request.amount },
    },
  });
  if (refundError) throw new Error(refundError.message);
  return data ?? { refunded: false };
}
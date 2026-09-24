/**
 * Mock data for the Refund Queue. Shapes mirror the future API contract
 * (`GET /admin/refunds`, `PATCH /admin/refunds/:id`) so swapping these for
 * a real fetch — and the real Razorpay refund trigger on approval — later
 * is a one-file change.
 */
import { getBookingById } from "@/data/bookings";
import { getUserById } from "@/data/users";
import { getVenueById } from "@/data/venues";

export type RefundRequestStatus = "pending" | "approved" | "rejected";

export type RefundRequest = {
  id: string;
  bookingId: string;
  amount: number;
  reason: string;
  requestedDate: string;
  status: RefundRequestStatus;
  reviewedBy?: string;
  reviewNote?: string;
};

export const refundRequests: RefundRequest[] = [
  {
    id: "REF-201",
    bookingId: "BKG-1002",
    amount: 1400,
    reason: "Customer cancelled well within the free-cancellation window.",
    requestedDate: "2026-08-30",
    status: "approved",
    reviewedBy: "Ananya Sharma",
    reviewNote: "Within policy — approved.",
  },
  {
    id: "REF-202",
    bookingId: "BKG-1004",
    amount: 1200,
    reason: "Customer injured and can't attend — requesting a refund outside the standard cancellation window.",
    requestedDate: "2026-08-30",
    status: "pending",
  },
  {
    id: "REF-203",
    bookingId: "BKG-1006",
    amount: 1400,
    reason: "Customer disputes the no-refund outcome, says the cancellation was inside the window per the app's own timer.",
    requestedDate: "2026-08-29",
    status: "pending",
  },
  {
    id: "REF-204",
    bookingId: "BKG-1005",
    amount: 1600,
    reason: "Customer requested a refund after the session was already completed.",
    requestedDate: "2026-08-29",
    status: "rejected",
    reviewedBy: "Ananya Sharma",
    reviewNote: "Session was completed as scheduled — not eligible for a refund under policy.",
  },
];

export function getRefundRequestById(id: string) {
  return refundRequests.find((r) => r.id === id);
}

export function enrichRefundRequest(request: RefundRequest) {
  const booking = getBookingById(request.bookingId);
  const customer = booking ? getUserById(booking.customerId) : undefined;
  const venue = booking ? getVenueById(booking.venueId) : undefined;
  return {
    ...request,
    customerName: customer?.name ?? "Unknown customer",
    venueName: venue?.name ?? "Unknown venue",
  };
}

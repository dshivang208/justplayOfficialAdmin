/**
 * Mock data for Payout Oversight. Shapes mirror the future API contract
 * (`GET /admin/payouts`, `PATCH /admin/payouts/:id`) so swapping these for
 * real fetches later is a one-file change.
 */
import { getVenueById } from "@/data/venues";

export type PayoutRunStatus = "scheduled" | "processing" | "paid" | "failed" | "delayed";
export type PayoutMethod = "Bank Transfer" | "UPI";

export type Payout = {
  id: string;
  venueId: string;
  amount: number;
  status: PayoutRunStatus;
  scheduledDate: string;
  method: PayoutMethod;
  failureReason?: string;
  delayReason?: string;
};

export const payouts: Payout[] = [
  {
    id: "PYT-501",
    venueId: "ven-001",
    amount: 2800,
    status: "scheduled",
    scheduledDate: "2026-09-02",
    method: "Bank Transfer",
  },
  {
    id: "PYT-502",
    venueId: "ven-003",
    amount: 2352,
    status: "failed",
    scheduledDate: "2026-08-29",
    method: "UPI",
    failureReason: "Bank account verification expired — partner needs to re-link their payout account.",
  },
  {
    id: "PYT-503",
    venueId: "ven-004",
    amount: 1408,
    status: "paid",
    scheduledDate: "2026-08-30",
    method: "Bank Transfer",
  },
  {
    id: "PYT-504",
    venueId: "ven-005",
    amount: 1080,
    status: "paid",
    scheduledDate: "2026-08-30",
    method: "Bank Transfer",
  },
  {
    id: "PYT-505",
    venueId: "ven-006",
    amount: 968,
    status: "processing",
    scheduledDate: "2026-09-01",
    method: "Bank Transfer",
  },
  {
    id: "PYT-506",
    venueId: "ven-003",
    amount: 1400,
    status: "delayed",
    scheduledDate: "2026-09-05",
    method: "UPI",
    delayReason: "Held pending fraud review on the linked partner account.",
  },
];

export function getPayoutById(id: string) {
  return payouts.find((p) => p.id === id);
}

export function enrichPayout(payout: Payout) {
  const venue = getVenueById(payout.venueId);
  return {
    ...payout,
    venueName: venue?.name ?? "Unknown venue",
    city: venue?.city ?? "—",
  };
}

export type PendingDeduction = {
  id: string;
  venueId: string;
  bookingId: string;
  amount: number;
  reason: string;
  queuedDate: string;
  targetPayoutId?: string;
};

export const pendingDeductions: PendingDeduction[] = [
  {
    id: "DED-01",
    venueId: "ven-003",
    bookingId: "BKG-1002",
    amount: 1400,
    reason: "Refund clawback — booking cancelled within the free window and refunded to the customer.",
    queuedDate: "2026-08-30",
    targetPayoutId: "PYT-506",
  },
  {
    id: "DED-02",
    venueId: "ven-007",
    bookingId: "BKG-1006",
    amount: 700,
    reason: "Partial goodwill refund approved by support — deducting from the venue's next payout batch.",
    queuedDate: "2026-08-29",
  },
];

export function enrichDeduction(deduction: PendingDeduction) {
  const venue = getVenueById(deduction.venueId);
  return {
    ...deduction,
    venueName: venue?.name ?? "Unknown venue",
  };
}

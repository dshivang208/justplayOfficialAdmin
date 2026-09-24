/**
 * Mock data for the platform-wide Transaction Log. Shapes mirror the
 * future API contract (`GET /admin/transactions`) so swapping this for a
 * real Razorpay-backed fetch later is a one-file change.
 */
import { getBookingById } from "@/data/bookings";
import { getUserById } from "@/data/users";

export type TransactionStatus = "success" | "failed" | "pending";
export type ReconciliationStatus = "matched" | "mismatch" | "pending";

export type Transaction = {
  id: string;
  bookingId: string;
  amount: number;
  gatewayAmount: number;
  gateway: "Razorpay";
  status: TransactionStatus;
  reconciliation: ReconciliationStatus;
  mismatchNote?: string;
  timestamp: string;
};

export const transactions: Transaction[] = [
  { id: "TXN-9001", bookingId: "BKG-1001", amount: 1600, gatewayAmount: 1600, gateway: "Razorpay", status: "success", reconciliation: "matched", timestamp: "2026-08-31T13:02:00" },
  { id: "TXN-9002", bookingId: "BKG-1002", amount: 1400, gatewayAmount: 1400, gateway: "Razorpay", status: "success", reconciliation: "matched", timestamp: "2026-08-30T09:14:00" },
  { id: "TXN-9003", bookingId: "BKG-1003", amount: 800, gatewayAmount: 800, gateway: "Razorpay", status: "success", reconciliation: "matched", timestamp: "2026-08-30T06:47:00" },
  {
    id: "TXN-9004",
    bookingId: "BKG-1004",
    amount: 1200,
    gatewayAmount: 1200,
    gateway: "Razorpay",
    status: "pending",
    reconciliation: "pending",
    timestamp: "2026-08-30T18:20:00",
  },
  {
    id: "TXN-9005",
    bookingId: "BKG-1005",
    amount: 1600,
    gatewayAmount: 1550,
    gateway: "Razorpay",
    status: "success",
    reconciliation: "mismatch",
    mismatchNote:
      "Razorpay settled ₹1,550 — ₹50 short of the ₹1,600 booking amount. Likely a gateway fee misclassified as part of the settlement; needs manual reconciliation.",
    timestamp: "2026-08-29T20:05:00",
  },
  { id: "TXN-9006", bookingId: "BKG-1006", amount: 1400, gatewayAmount: 1400, gateway: "Razorpay", status: "success", reconciliation: "matched", timestamp: "2026-08-29T18:32:00" },
  { id: "TXN-9007", bookingId: "BKG-1007", amount: 1100, gatewayAmount: 1100, gateway: "Razorpay", status: "success", reconciliation: "matched", timestamp: "2026-08-28T19:01:00" },
  { id: "TXN-9008", bookingId: "BKG-1008", amount: 1400, gatewayAmount: 1400, gateway: "Razorpay", status: "success", reconciliation: "matched", timestamp: "2026-08-27T18:10:00" },
  { id: "TXN-9009", bookingId: "BKG-1009", amount: 800, gatewayAmount: 800, gateway: "Razorpay", status: "success", reconciliation: "matched", timestamp: "2026-08-27T09:02:00" },
  {
    id: "TXN-9010",
    bookingId: "BKG-1010",
    amount: 1200,
    gatewayAmount: 0,
    gateway: "Razorpay",
    status: "failed",
    reconciliation: "matched",
    timestamp: "2026-08-26T18:41:00",
  },
  { id: "TXN-9011", bookingId: "BKG-1011", amount: 1600, gatewayAmount: 1600, gateway: "Razorpay", status: "success", reconciliation: "matched", timestamp: "2026-08-25T19:16:00" },
  { id: "TXN-9012", bookingId: "BKG-1012", amount: 600, gatewayAmount: 600, gateway: "Razorpay", status: "success", reconciliation: "matched", timestamp: "2026-08-24T17:05:00" },
  { id: "TXN-9013", bookingId: "BKG-1013", amount: 800, gatewayAmount: 800, gateway: "Razorpay", status: "success", reconciliation: "matched", timestamp: "2026-08-23T08:12:00" },
  { id: "TXN-9014", bookingId: "BKG-1014", amount: 1100, gatewayAmount: 1100, gateway: "Razorpay", status: "success", reconciliation: "matched", timestamp: "2026-08-22T18:47:00" },
];

export function getTransactionById(id: string) {
  return transactions.find((t) => t.id === id);
}

/** Enriched view with booking/customer context resolved, for table display. */
export function enrichTransaction(txn: Transaction) {
  const booking = getBookingById(txn.bookingId);
  const customer = booking ? getUserById(booking.customerId) : undefined;
  return {
    ...txn,
    sport: booking?.sport ?? "—",
    customerName: customer?.name ?? "Unknown customer",
  };
}

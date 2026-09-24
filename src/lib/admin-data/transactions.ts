/**
 * Real Supabase-backed transaction log + reconciliation queries for
 * Backend Phase D, replacing src/data/transactions.ts (mock).
 *
 * REAL SCHEMA: there's no dedicated "transactions" table — a transaction
 * IS a booking with a payment_id set. Gateway status is derived, not
 * stored directly: 'success' when payment_status is paid/refunded,
 * 'failed' when payment_events shows a payment.failed webhook for this
 * booking (payment_status alone can't tell a genuinely failed attempt
 * apart from one still pending), otherwise 'pending'.
 *
 * Reconciliation status comes from `reconciliation_flags` (this phase):
 * an OPEN flag means a mismatch was found and hasn't been resolved; a
 * RESOLVED flag means one was found and later matched or was manually
 * cleared; no flag at all honestly means "not currently flagged" — which
 * could mean it was checked and fine, or hasn't been checked yet. Both
 * show as 'pending' rather than guessing which.
 */
import { supabase } from "@/lib/supabaseClient";

export type TransactionStatus = "success" | "pending" | "failed";
export type ReconciliationStatus = "matched" | "mismatch" | "pending";

export type Transaction = {
  id: string; // razorpay payment_id
  bookingId: string;
  customerName: string;
  venueName: string;
  amount: number;
  status: TransactionStatus;
  reconciliation: ReconciliationStatus;
  mismatchNote: string | null;
  timestamp: string;
};

export type ReconciliationFlag = {
  id: string;
  bookingId: string;
  razorpayPaymentId: string;
  expectedAmount: number;
  settledAmount: number | null;
  razorpayStatus: string | null;
  mismatchType: "amount_mismatch" | "status_mismatch" | "not_found";
  status: "open" | "resolved";
  note: string | null;
  detectedAt: string;
};

type BookingRow = {
  id: string;
  payment_id: string;
  price_paid: number;
  credit_applied: number;
  payment_status: "pending" | "paid" | "refunded";
  created_at: string;
  users: { name: string } | null;
  venues: { name: string } | null;
};

type FlagRow = {
  id: string;
  booking_id: string;
  razorpay_payment_id: string;
  expected_amount: number;
  settled_amount: number | null;
  razorpay_status: string | null;
  mismatch_type: "amount_mismatch" | "status_mismatch" | "not_found";
  status: "open" | "resolved";
  note: string | null;
  detected_at: string;
};

function mismatchLabel(flag: FlagRow): string {
  if (flag.mismatch_type === "not_found") return "Razorpay has no record of this payment ID.";
  if (flag.mismatch_type === "amount_mismatch") {
    return `Expected \u20b9${flag.expected_amount.toLocaleString("en-IN")}, Razorpay shows \u20b9${(flag.settled_amount ?? 0).toLocaleString("en-IN")}.`;
  }
  return `Expected a matching status, Razorpay reports "${flag.razorpay_status}".`;
}

export async function listTransactions(): Promise<Transaction[]> {
  const [bookingsRes, eventsRes, flagsRes] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, payment_id, price_paid, credit_applied, payment_status, created_at, users(name), venues(name)")
      .not("payment_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<BookingRow[]>(),
    supabase
      .from("payment_events")
      .select("booking_id, razorpay_event")
      .ilike("razorpay_event", "%failed%")
      .returns<{ booking_id: string | null; razorpay_event: string }[]>(),
    supabase
      .from("reconciliation_flags")
      .select(
        "id, booking_id, razorpay_payment_id, expected_amount, settled_amount, razorpay_status, mismatch_type, status, note, detected_at",
      )
      .returns<FlagRow[]>(),
  ]);
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);
  if (eventsRes.error) throw new Error(eventsRes.error.message);
  if (flagsRes.error) throw new Error(flagsRes.error.message);

  const failedBookingIds = new Set((eventsRes.data ?? []).map((e) => e.booking_id).filter(Boolean));
  const flagByBooking = new Map((flagsRes.data ?? []).map((f) => [f.booking_id, f]));

  return (bookingsRes.data ?? []).map((row) => {
    const flag = flagByBooking.get(row.id);
    let status: TransactionStatus = "pending";
    if (row.payment_status === "paid" || row.payment_status === "refunded") status = "success";
    else if (failedBookingIds.has(row.id)) status = "failed";

    let reconciliation: ReconciliationStatus = "pending";
    let mismatchNote: string | null = null;
    if (flag?.status === "open") {
      reconciliation = "mismatch";
      mismatchNote = flag.note ?? mismatchLabel(flag);
    } else if (flag?.status === "resolved") {
      reconciliation = "matched";
    }

    return {
      id: row.payment_id,
      bookingId: row.id,
      customerName: row.users?.name ?? "Unknown customer",
      venueName: row.venues?.name ?? "Unknown venue",
      amount: row.price_paid,
      status,
      reconciliation,
      mismatchNote,
      timestamp: row.created_at,
    };
  });
}

export async function listReconciliationFlags(): Promise<ReconciliationFlag[]> {
  const { data, error } = await supabase
    .from("reconciliation_flags")
    .select(
      "id, booking_id, razorpay_payment_id, expected_amount, settled_amount, razorpay_status, mismatch_type, status, note, detected_at",
    )
    .eq("status", "open")
    .order("detected_at", { ascending: false })
    .returns<FlagRow[]>();
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    bookingId: row.booking_id,
    razorpayPaymentId: row.razorpay_payment_id,
    expectedAmount: row.expected_amount,
    settledAmount: row.settled_amount,
    razorpayStatus: row.razorpay_status,
    mismatchType: row.mismatch_type,
    status: row.status,
    note: row.note,
    detectedAt: row.detected_at,
  }));
}

// ── Mutations ────────────────────────────────────────────────────────────

export async function runReconciliation(days = 7) {
  const { data, error } = await supabase.functions.invoke<{ checked: number; mismatches: number }>(
    "run-payment-reconciliation",
    { body: { days } },
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Reconciliation did not return a result.");
  return data;
}

export async function resolveReconciliationFlag(flagId: string, note?: string) {
  const { data, error } = await supabase.rpc("admin_resolve_reconciliation_flag", {
    p_flag_id: flagId,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
  return data;
}
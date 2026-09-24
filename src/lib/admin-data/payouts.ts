/**
 * Real Supabase-backed payout oversight queries for Backend Phase D,
 * replacing src/data/payouts.ts (mock).
 *
 * REAL SCHEMA: payouts.status is only 'processing' | 'completed' |
 * 'failed' — there's no 'scheduled' or 'delayed'. A "scheduled" payout
 * isn't a row in `payouts` at all; it's a pending, not-yet-run amount
 * computed on the fly (admin_pending_payouts, this phase's platform-wide
 * equivalent of the partner app's own owner-scoped
 * partner_pending_payout_line_items). "Delay" has been DROPPED entirely
 * — there's no real concept of a persisted-but-movable scheduled date to
 * push out; a payout simply doesn't exist yet until it runs.
 *
 * Trigger/retry both call the SAME Cashfree Edge Function the partner
 * app's own "Run payout now" button calls (cashfree-run-payout, now
 * extended to also recognize an admin caller and a retry mode) — not a
 * duplicate implementation.
 */
import { supabase } from "@/lib/supabaseClient";

export type PayoutStatus = "processing" | "completed" | "failed";

export type Payout = {
  id: string;
  venueId: string;
  venueName: string;
  amount: number;
  method: "bank" | "upi";
  payoutDate: string;
  status: PayoutStatus;
  cashfreeTransferId: string | null;
};

export type PendingPayout = {
  venueId: string;
  venueName: string;
  pendingNet: number;
  pendingDeductions: number;
  payoutMethod: string | null;
  verificationStatus: string | null;
};

export type Deduction = {
  id: string;
  venueId: string;
  venueName: string;
  bookingId: string;
  amount: number;
  reason: string;
  createdAt: string;
};

type PayoutRow = {
  id: string;
  venue_id: string;
  amount: number;
  payout_method: "bank" | "upi";
  payout_date: string;
  status: PayoutStatus;
  cashfree_transfer_id: string | null;
  venues: { name: string } | null;
};

type PendingRow = {
  venue_id: string;
  venue_name: string;
  pending_net: number;
  pending_deductions: number;
  payout_method: string | null;
  verification_status: string | null;
};

type DeductionRow = {
  id: string;
  venue_id: string;
  booking_id: string;
  amount: number;
  reason: string;
  created_at: string;
  venues: { name: string } | null;
};

export async function listPayouts(): Promise<Payout[]> {
  const { data, error } = await supabase
    .from("payouts")
    .select("id, venue_id, amount, payout_method, payout_date, status, cashfree_transfer_id, venues(name)")
    .order("payout_date", { ascending: false })
    .limit(300)
    .returns<PayoutRow[]>();
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    venueId: row.venue_id,
    venueName: row.venues?.name ?? "Unknown venue",
    amount: row.amount,
    method: row.payout_method,
    payoutDate: row.payout_date,
    status: row.status,
    cashfreeTransferId: row.cashfree_transfer_id,
  }));
}

export async function listPendingPayouts(): Promise<PendingPayout[]> {
  const { data, error } = await supabase.rpc("admin_pending_payouts");
  if (error) throw new Error(error.message);

  return ((data ?? []) as PendingRow[]).map((row) => ({
    venueId: row.venue_id,
    venueName: row.venue_name,
    pendingNet: row.pending_net,
    pendingDeductions: row.pending_deductions,
    payoutMethod: row.payout_method,
    verificationStatus: row.verification_status,
  }));
}

export async function listPendingDeductions(): Promise<Deduction[]> {
  const { data, error } = await supabase
    .from("payout_deductions")
    .select("id, venue_id, booking_id, amount, reason, created_at, venues(name)")
    .is("applied_to_payout_id", null)
    .order("created_at", { ascending: false })
    .returns<DeductionRow[]>();
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    venueId: row.venue_id,
    venueName: row.venues?.name ?? "Unknown venue",
    bookingId: row.booking_id,
    amount: row.amount,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

// ── Mutations ────────────────────────────────────────────────────────────

type RunResult = {
  venueId?: string;
  payoutId?: string;
  amount?: number;
  skipped?: string;
  error?: string;
};

export async function triggerPayout(venueId: string) {
  const { data, error } = await supabase.functions.invoke<{ mode: string; result: RunResult }>(
    "cashfree-run-payout",
    { body: { venue_id: venueId } },
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not trigger this payout.");
  return data.result;
}

export async function retryPayout(payoutId: string) {
  const { data, error } = await supabase.functions.invoke<{ mode: string; result: RunResult }>(
    "cashfree-run-payout",
    { body: { retry_payout_id: payoutId } },
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not retry this payout.");
  return data.result;
}
/**
 * Real financial summary queries for Backend Phase D, replacing
 * src/data/financials.ts (mock).
 *
 * Backed by admin_financial_daily, a MATERIALIZED VIEW (Phase D
 * migration) rather than aggregating bookings/payouts/refund_log/
 * wallet_transactions from scratch on every dashboard load. GMV/
 * commission are attributed to the day a booking was MADE, not the
 * session date — that's when the platform's revenue is actually earned.
 * "Net revenue" here is commission minus refunds minus goodwill credits;
 * it does NOT subtract Razorpay's own per-transaction processing fee,
 * since that isn't tracked anywhere in this schema (nothing ingests
 * Razorpay's fee report) — a real "true net" figure would need that, not
 * an invented percentage estimate.
 */
import { supabase } from "@/lib/supabaseClient";

export type FinancialDay = {
  date: string;
  gmv: number;
  commission: number;
  payoutsMade: number;
  refunds: number;
  credits: number;
};

type SummaryRow = {
  day: string;
  gmv: number;
  commission: number;
  payouts_made: number;
  refunds: number;
  credits: number;
};

export async function getFinancialSummary(days: number): Promise<FinancialDay[]> {
  const { data, error } = await supabase.rpc("admin_financial_summary", { p_days: days });
  if (error) throw new Error(error.message);

  return ((data ?? []) as SummaryRow[]).map((row) => ({
    date: row.day,
    gmv: row.gmv,
    commission: row.commission,
    payoutsMade: row.payouts_made,
    refunds: row.refunds,
    credits: row.credits,
  }));
}

/** The view is only as fresh as the last refresh — call this before
 *  reading if the dashboard needs to reflect activity from the last few
 *  minutes. Otherwise, a scheduled refresh (pg_cron, same pattern as the
 *  payout/reconciliation jobs) is the intended way to keep it current
 *  without every page load paying the aggregation cost. */
export async function refreshFinancialSummary() {
  const { error } = await supabase.rpc("admin_refresh_financial_summary");
  if (error) throw new Error(error.message);
}
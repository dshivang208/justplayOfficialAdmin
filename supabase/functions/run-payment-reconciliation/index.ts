// JustPlay Admin — Backend Phase D: run-payment-reconciliation
//
// Compares what Razorpay says about each recent payment against our own
// booking record, via Razorpay's Fetch a Payment API
// (GET /v1/payments/:id — returns the amount actually captured, in
// paise, plus its own status). Two ways to call this, same pattern as
// the partner app's cashfree-run-payout:
//   1. A signed-in Super Admin, optional { days } body (default 7) — a
//      manual "run reconciliation now" action. Uses this app's own
//      requireAdmin — every other admin-* function's pattern.
//   2. A cron/service context, header `x-cron-secret: <CRON_SECRET>` — for
//      a daily scheduled run (see the pg_cron snippet at the bottom).
//
// Every check's outcome — match or mismatch — is recorded via
// record_reconciliation_check (service role), which both raises a new
// flag AND auto-resolves a previously-open one that now matches (e.g. a
// late webhook finally arrived). Nothing here decides policy about what
// to DO with a mismatch — that's an admin, from the Reconciliation queue.

import { createClient } from "npm:@supabase/supabase-js@2";
import { requireAdmin, json, corsHeaders, SUPABASE_URL, SERVICE_ROLE_KEY } from "../_shared/adminAuth.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")!;
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");

type BookingRow = {
  id: string;
  payment_id: string;
  price_paid: number;
  credit_applied: number;
  payment_status: "pending" | "paid" | "refunded";
};

type RazorpayPayment = {
  amount: number; // paise, actually captured
  status: string; // created | authorized | captured | refunded | failed
};

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment | null> {
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
    headers: { Authorization: "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`) },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    console.error(`Razorpay fetch-payment failed for ${paymentId}:`, await res.text().catch(() => ""));
    return null;
  }
  return res.json();
}

/** What we'd EXPECT Razorpay's status to be, given our own payment_status
 *  — used only to detect a status disagreement, not to judge which side
 *  is "right" (a human decides that from the reconciliation queue). */
function expectedRazorpayStatuses(paymentStatus: BookingRow["payment_status"]): string[] {
  if (paymentStatus === "paid") return ["captured"];
  if (paymentStatus === "refunded") return ["refunded", "captured"]; // partial refunds stay 'captured' at Razorpay
  return ["created", "authorized", "failed"];
}

async function reconcileBooking(
  serviceClient: ReturnType<typeof createClient>,
  booking: BookingRow,
): Promise<{ bookingId: string; mismatch: string | null }> {
  const expectedAmountRupees = booking.price_paid - booking.credit_applied;
  const payment = await fetchRazorpayPayment(booking.payment_id);

  if (!payment) {
    await serviceClient.rpc("record_reconciliation_check", {
      p_booking_id: booking.id,
      p_payment_id: booking.payment_id,
      p_expected_amount: expectedAmountRupees,
      p_settled_amount: null,
      p_razorpay_status: null,
      p_mismatch_type: "not_found",
    });
    return { bookingId: booking.id, mismatch: "not_found" };
  }

  const settledAmountRupees = Math.round(payment.amount / 100);
  const amountMismatch = settledAmountRupees !== expectedAmountRupees;
  const statusMismatch = !expectedRazorpayStatuses(booking.payment_status).includes(payment.status);
  const mismatchType = amountMismatch ? "amount_mismatch" : statusMismatch ? "status_mismatch" : null;

  await serviceClient.rpc("record_reconciliation_check", {
    p_booking_id: booking.id,
    p_payment_id: booking.payment_id,
    p_expected_amount: expectedAmountRupees,
    p_settled_amount: settledAmountRupees,
    p_razorpay_status: payment.status,
    p_mismatch_type: mismatchType,
  });

  return { bookingId: booking.id, mismatch: mismatchType };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const cronSecret = req.headers.get("x-cron-secret");
  const isCron = Boolean(cronSecret && CRON_SECRET && timingSafeEqual(cronSecret, CRON_SECRET));

  let serviceClient: ReturnType<typeof createClient>;
  if (isCron) {
    serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } else {
    const auth = await requireAdmin(req, { requireSuperAdmin: true });
    if ("error" in auth) return json({ error: auth.error }, auth.status);
    serviceClient = auth.serviceClient;
  }

  let days = 7;
  try {
    const body = await req.json();
    if (typeof body?.days === "number" && body.days > 0 && body.days <= 90) days = body.days;
  } catch {
    // No body (typical for the cron call) — use the default.
  }

  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data: bookings, error } = await serviceClient
    .from("bookings")
    .select("id, payment_id, price_paid, credit_applied, payment_status")
    .not("payment_id", "is", null)
    .gte("created_at", since)
    .returns<BookingRow[]>();

  if (error) return json({ error: error.message }, 500);

  const results = [];
  for (const booking of bookings ?? []) {
    results.push(await reconcileBooking(serviceClient, booking));
  }

  const mismatches = results.filter((r) => r.mismatch !== null);
  return json({ checked: results.length, mismatches: mismatches.length, results: mismatches });
});

// ----------------------------------------------------------------------------
// Scheduling a daily run (run once from the SQL editor):
//
//   select cron.schedule(
//     'daily-payment-reconciliation',
//     '0 4 * * *',
//     $$
//     select net.http_post(
//       url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/run-payment-reconciliation',
//       headers := jsonb_build_object('x-cron-secret', 'YOUR_CRON_SECRET'),
//       body := '{"days": 2}'::jsonb
//     );
//     $$
//   );
// ----------------------------------------------------------------------------
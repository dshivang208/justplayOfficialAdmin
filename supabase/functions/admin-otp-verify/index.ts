// JustPlay Admin — Backend Phase A: admin-otp-verify
//
// Mirrors the consumer app's `mock-otp-verify` function (same
// generate-a-magic-link-server-side-then-redeem-it-client-side technique),
// with one deliberate difference: admin accounts are manually provisioned,
// so this function REJECTS any phone number that doesn't already have a
// row in `public.admin_users`. There is no "first time we've seen this
// number, create an account" branch here — that branch is exactly what
// the consumer app's version has, and exactly what an admin login must
// never do.
//
// ─────────────────────────────────────────────────────────────────────────
// SWAP POINT FOR REAL SMS (Twilio/MSG91 etc.):
// Replace ONLY `isValidMockOtp` with a real lookup against a per-phone OTP
// challenge you issued at "send OTP" time. Everything below that — the
// admin_users lookup, `generateLink`, and the rejection of unprovisioned
// numbers — stays exactly the same.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** TODO(real-sms): replace with a real per-phone OTP challenge lookup. */
function isValidMockOtp(code: string) {
  return /^\d{6}$/.test(code);
}

function toE164(rawDigits: string) {
  const digits = rawDigits.replace(/\D/g, "").slice(-10);
  return { digits, e164: `+91${digits}` };
}

/**
 * Same email-shaped-session-for-a-phone-number trick as the consumer app,
 * but on a visibly different synthetic domain so an admin session and a
 * consumer session for the same phone number can never resolve to the
 * same auth.users row by accident.
 */
function syntheticEmail(e164: string) {
  return `${e164.replace("+", "")}@phone.justplay-admin.internal`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { phone?: unknown; otp?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const { phone, otp } = body;
  if (typeof phone !== "string" || typeof otp !== "string") {
    return json({ error: "phone and otp are required" }, 400);
  }

  if (!isValidMockOtp(otp)) {
    return json({ error: "Enter the 6-digit code we sent you." }, 400);
  }

  const { digits, e164 } = toE164(phone);
  if (digits.length !== 10) {
    return json({ error: "Enter a valid 10-digit Indian mobile number." }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // The whole point of this function: refuse to mint a session for a
  // phone number that isn't already a provisioned admin. No account is
  // ever created here.
  const { data: adminRow, error: lookupError } = await admin
    .from("admin_users")
    .select("id, name, role, email, phone")
    .eq("phone", e164)
    .maybeSingle();

  if (lookupError) return json({ error: lookupError.message }, 500);
  if (!adminRow) {
    return json(
      { error: "This phone number isn't registered for admin access. Contact IT." },
      403,
    );
  }

  const email = syntheticEmail(e164);
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    return json({ error: linkError?.message ?? "Could not start a session for this number." }, 500);
  }

  // The admin_users row's `id` must be THIS auth user's id for every RLS
  // policy in the Phase A migration to resolve correctly. In normal
  // operation these already match, because Phase E's "add admin" flow
  // creates the auth.users row first and inserts admin_users against that
  // same id. If they don't match, something is wrong with how the account
  // was provisioned — fail loudly rather than silently repoint the row.
  const userId = linkData.user.id;
  if (adminRow.id !== userId) {
    return json(
      { error: "This admin account's identity is out of sync. Contact IT rather than retrying." },
      500,
    );
  }

  // Best-effort — a failure here shouldn't block the login itself, since
  // the session token has already been minted above.
  const { error: touchError } = await admin
    .from("admin_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", userId);
  if (touchError) console.error("Could not update last_login_at:", touchError.message);

  return json({
    tokenHash: linkData.properties.hashed_token,
    admin: { id: userId, name: adminRow.name, role: adminRow.role, email: adminRow.email, phone: e164 },
  });
});
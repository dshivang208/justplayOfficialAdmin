// JustPlay Admin — Backend Phase E: admin-invite-admin
//
// Completes what admin-otp-verify (Phase A) already anticipated in its
// own comments: "Phase E's 'add admin' flow creates the auth.users row
// first and inserts admin_users against that same id." That ordering
// matters and can't be done from a plain SQL function — creating an
// auth.users identity needs the Supabase Admin API, which only works
// with the service role key, never from a client-side RPC.
//
// Super Admin only. The invited person logs in later the normal way
// (phone + OTP, admin-otp-verify) — nothing here sends them anything;
// how they're told their number now has access is outside this app.

import { createClient } from "npm:@supabase/supabase-js@2";
import { requireAdmin, json, corsHeaders } from "../_shared/adminAuth.ts";

function toE164(rawDigits: string) {
  const digits = rawDigits.replace(/\D/g, "").slice(-10);
  return { digits, e164: `+91${digits}` };
}

/** Must exactly match admin-otp-verify's own syntheticEmail() — this is
 *  the auth.users identity a later OTP login will resolve to. */
function syntheticEmail(e164: string) {
  return `${e164.replace("+", "")}@phone.justplay-admin.internal`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireAdmin(req, { requireSuperAdmin: true });
  if ("error" in auth) return json({ error: auth.error }, auth.status);
  const { serviceClient } = auth;

  let body: { name?: unknown; phone?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const { name, phone, role } = body;
  if (typeof name !== "string" || name.trim().length < 2) {
    return json({ error: "Enter a name." }, 400);
  }
  if (typeof role !== "string" || !["super_admin", "ops_support"].includes(role)) {
    return json({ error: "Invalid role." }, 400);
  }
  if (typeof phone !== "string") {
    return json({ error: "Enter a phone number." }, 400);
  }
  const { digits, e164 } = toE164(phone);
  if (digits.length !== 10) {
    return json({ error: "Enter a valid 10-digit Indian mobile number." }, 400);
  }

  const { data: existing } = await serviceClient
    .from("admin_users")
    .select("id")
    .eq("phone", e164)
    .maybeSingle();
  if (existing) {
    return json({ error: "This phone number already has admin access." }, 400);
  }

  const email = syntheticEmail(e164);

  // Create the auth identity FIRST — admin_users.id must reference it.
  // If an auth.users row for this synthetic email somehow already exists
  // (e.g. a previously removed admin being re-invited), reuse its id
  // rather than erroring, so a re-invite after removal works cleanly.
  const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
    email,
    email_confirm: true,
    phone: e164,
    phone_confirm: true,
  });

  let userId = created?.user?.id;
  if (createError) {
    const isAlreadyRegistered = /already been registered|already exists/i.test(createError.message);
    if (!isAlreadyRegistered) return json({ error: createError.message }, 500);

    const { data: list, error: listError } = await serviceClient.auth.admin.listUsers();
    if (listError) return json({ error: listError.message }, 500);
    userId = list.users.find((u: { email?: string; id: string }) => u.email === email)?.id;
    if (!userId) return json({ error: "Could not resolve the existing account for this number." }, 500);
  }

  const { data: adminRow, error: insertError } = await serviceClient
    .from("admin_users")
    .insert({ id: userId, phone: e164, name: name.trim(), role })
    .select()
    .maybeSingle();

  if (insertError) return json({ error: insertError.message }, 500);

  return json({ admin: adminRow });
});
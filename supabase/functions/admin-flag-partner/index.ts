// JustPlay Admin — Backend Phase B: admin-flag-partner
//
// Flags (or clears the flag on) a partner account — fraud/complaint
// concerns, not a financial action, so both roles may call this (Phase
// A's carve-out is specifically payout/commission/financial, and this
// isn't that).
//
// ASSUMPTION: `public.partners` has `flagged boolean` and `flag_reason
// text` columns — added by the Phase B migration if the table exists.
// If the real partner-app schema names these differently, update the
// column names below to match.

import { requireAdmin, logAdminAction, json, corsHeaders } from "../_shared/adminAuth.ts";

type Body = {
  partnerId?: unknown;
  action?: unknown; // "flag" | "unflag"
  reason?: unknown; // required when action === "flag"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireAdmin(req);
  if ("error" in auth) return json({ error: auth.error }, auth.status);
  const { admin, serviceClient } = auth;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const { partnerId, action, reason } = body;
  if (typeof partnerId !== "string" || (action !== "flag" && action !== "unflag")) {
    return json({ error: "partnerId and action ('flag' | 'unflag') are required." }, 400);
  }
  if (action === "flag" && (typeof reason !== "string" || reason.trim().length === 0)) {
    return json({ error: "A reason is required to flag a partner." }, 400);
  }

  const { data: partner, error: partnerError } = await serviceClient
    .from("partners")
    .select("id, business_name")
    .eq("id", partnerId)
    .maybeSingle();
  if (partnerError) return json({ error: partnerError.message }, 500);
  if (!partner) return json({ error: "Partner not found." }, 404);

  const update =
    action === "flag"
      ? { flagged: true, flag_reason: reason, flagged_by: admin.id }
      : { flagged: false, flag_reason: null, flagged_by: null };

  const { error: updateError } = await serviceClient.from("partners").update(update).eq("id", partnerId);
  if (updateError) return json({ error: updateError.message }, 500);

  await logAdminAction(serviceClient, {
    adminId: admin.id,
    action: action === "flag" ? "partner.flag" : "partner.unflag",
    targetTable: "partners",
    targetId: partnerId,
    details: { businessName: partner.business_name, reason: reason ?? null },
  });

  return json({ ok: true, partnerId, flagged: action === "flag" });
});

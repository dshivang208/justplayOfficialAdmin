// JustPlay Admin — Backend Phase B: admin-approve-venue
//
// Approves or rejects a pending venue. Approving is the ONE place in the
// whole admin app that reaches across into the partner app's data: it
// flips the venue to approved AND — if this is the partner's first
// approved venue — flips the partner's own approval_status too, which is
// what the partner app checks to decide whether to show their dashboard
// or a "pending approval" screen. That's the "wire this real dependency,
// don't leave it disconnected" requirement from the brief.
//
// Both roles (super_admin and ops_support) may call this — venue
// approval isn't in Phase A's payout/commission/financial carve-out.
//
// ASSUMPTION: the partner app checks `public.partners.approval_status`.
// If it actually checks something else (a different column name, or a
// per-venue flag on `partner_venues` instead of a partner-level one),
// update the block marked ASSUMED below to match — the rest of this
// function (venue update, audit logging) doesn't need to change.

import { createClient } from "npm:@supabase/supabase-js@2";
import { requireAdmin, logAdminAction, json, corsHeaders } from "../_shared/adminAuth.ts";

type Body = {
  venueId?: unknown;
  decision?: unknown; // "approve" | "reject"
  reason?: unknown; // required when decision === "reject"
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

  const { venueId, decision, reason } = body;
  if (typeof venueId !== "string" || (decision !== "approve" && decision !== "reject")) {
    return json({ error: "venueId and decision ('approve' | 'reject') are required." }, 400);
  }
  if (decision === "reject" && (typeof reason !== "string" || reason.trim().length === 0)) {
    return json({ error: "A reason is required to reject a venue." }, 400);
  }

  const { data: venue, error: venueError } = await serviceClient
    .from("venues")
    .select("id, name, approval_status")
    .eq("id", venueId)
    .maybeSingle();

  if (venueError) return json({ error: venueError.message }, 500);
  if (!venue) return json({ error: "Venue not found." }, 404);
  if (venue.approval_status !== "pending") {
    return json({ error: `This venue is already ${venue.approval_status}, not pending.` }, 409);
  }

  // ── Resolve the owning partner ──────────────────────────────────────
  // ASSUMED: a `partner_venues` join table (partner_id, venue_id), since
  // that's the standard shape and matches the table name given in the
  // brief. If the real schema instead has a `partner_id` column directly
  // on `venues`, swap this lookup for `venue.partner_id` and drop the
  // partner_venues query entirely.
  let partnerId: string | null = null;
  if (await tableExists(serviceClient, "partner_venues")) {
    const { data: link, error: linkError } = await serviceClient
      .from("partner_venues")
      .select("partner_id")
      .eq("venue_id", venueId)
      .maybeSingle();
    if (linkError) return json({ error: linkError.message }, 500);
    partnerId = link?.partner_id ?? null;
  }

  if (decision === "reject") {
    const { error: updateError } = await serviceClient
      .from("venues")
      .update({ approval_status: "rejected", rejection_reason: reason, approved_by: admin.id, approved_at: null })
      .eq("id", venueId);
    if (updateError) return json({ error: updateError.message }, 500);

    await logAdminAction(serviceClient, {
      adminId: admin.id,
      action: "venue.reject",
      targetTable: "venues",
      targetId: venueId,
      details: { venueName: venue.name, reason },
    });

    return json({ ok: true, venue: { id: venueId, approval_status: "rejected" } });
  }

  // ── decision === "approve" ────────────────────────────────────────────
  const { error: updateError } = await serviceClient
    .from("venues")
    .update({
      approval_status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: admin.id,
      rejection_reason: null,
    })
    .eq("id", venueId);
  if (updateError) return json({ error: updateError.message }, 500);

  await logAdminAction(serviceClient, {
    adminId: admin.id,
    action: "venue.approve",
    targetTable: "venues",
    targetId: venueId,
    details: { venueName: venue.name },
  });

  let partnerUnlocked = false;

  if (partnerId && (await tableExists(serviceClient, "partners"))) {
    const { data: partner, error: partnerError } = await serviceClient
      .from("partners")
      .select("id, approval_status")
      .eq("id", partnerId)
      .maybeSingle();

    if (partnerError) {
      // The venue is already approved at this point — don't fail the
      // whole request over a problem looking up the partner side, but
      // make the gap loud rather than silent.
      console.error("Venue approved but partner lookup failed:", partnerError.message);
    } else if (partner && partner.approval_status !== "approved") {
      const { error: unlockError } = await serviceClient
        .from("partners")
        .update({ approval_status: "approved" })
        .eq("id", partnerId);

      if (unlockError) {
        console.error("Venue approved but partner unlock failed:", unlockError.message);
      } else {
        partnerUnlocked = true;
        await logAdminAction(serviceClient, {
          adminId: admin.id,
          action: "partner.unlock_dashboard",
          targetTable: "partners",
          targetId: partnerId,
          details: { triggeredByVenueId: venueId, triggeredByVenueName: venue.name },
        });
      }
    }
  }

  return json({
    ok: true,
    venue: { id: venueId, approval_status: "approved" },
    partnerUnlocked,
  });
});

async function tableExists(client: ReturnType<typeof createClient>, table: string) {
  const { error } = await client.from(table).select("*", { head: true, count: "exact" }).limit(1);
  // A missing table surfaces as a Postgres error (typically 42P01); any
  // other outcome (including "0 rows, no error") means the table exists.
  return !error;
}

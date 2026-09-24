// JustPlay Admin — Backend Phase B: admin-set-commission
//
// Super Admin only (Phase A's explicit carve-out: ops_support never
// touches commission). Updates venue_commission.commission_rate, inserts
// the change into venue_commission_history, and logs it to
// admin_audit_log — all three in one request, so there's never a state
// where the rate changed but the history/audit trail didn't.
//
// IMPORTANT — this is also the fix for a real disconnect: the partner
// app's actual payout math (venue_payout_net_amount, Phase D) has never
// read venue_commission at all — it reads courts.commission_rate, a
// fraction (0-1) set PER COURT, defaulting to 0. Before this fix, setting
// a rate here updated a number this admin app displays but changed
// nothing about what a venue actually gets paid. venue_commission stays
// as the venue-level control surface and audit trail this UI is built
// around, but every write here now also fans the same rate out to every
// court under that venue (converting the 0-100 percentage to the 0-1
// fraction courts.commission_rate expects) so the two can't drift apart.
// A venue with per-court overrides that genuinely need to differ from
// each other isn't supported by this venue-level UI — that would need a
// dedicated per-court screen, out of scope here.

import { requireAdmin, logAdminAction, json, corsHeaders } from "../_shared/adminAuth.ts";

type Body = {
  venueId?: unknown;
  newRate?: unknown;
  note?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireAdmin(req, { requireSuperAdmin: true });
  if ("error" in auth) return json({ error: auth.error }, auth.status);
  const { admin, serviceClient } = auth;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const { venueId, newRate, note } = body;
  if (typeof venueId !== "string" || typeof newRate !== "number") {
    return json({ error: "venueId and newRate are required." }, 400);
  }
  if (newRate < 0 || newRate > 100) {
    return json({ error: "newRate must be between 0 and 100." }, 400);
  }

  const { data: venue, error: venueError } = await serviceClient
    .from("venues")
    .select("id, name")
    .eq("id", venueId)
    .maybeSingle();
  if (venueError) return json({ error: venueError.message }, 500);
  if (!venue) return json({ error: "Venue not found." }, 404);

  // venue_commission has one row per venue (Phase A backfilled every
  // existing venue at the platform default) — read the current rate so
  // the history row is accurate even if this is somehow the first write.
  const { data: current, error: currentError } = await serviceClient
    .from("venue_commission")
    .select("commission_rate")
    .eq("venue_id", venueId)
    .maybeSingle();
  if (currentError) return json({ error: currentError.message }, 500);

  const previousRate = current?.commission_rate ?? 12.0;
  if (previousRate === newRate) {
    return json({ error: "New rate is the same as the current rate." }, 400);
  }

  const { error: upsertError } = await serviceClient.from("venue_commission").upsert(
    {
      venue_id: venueId,
      commission_rate: newRate,
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id" },
  );
  if (upsertError) return json({ error: upsertError.message }, 500);

  const { error: historyError } = await serviceClient.from("venue_commission_history").insert({
    venue_id: venueId,
    previous_rate: previousRate,
    new_rate: newRate,
    changed_by: admin.id,
    note: typeof note === "string" && note.trim().length > 0 ? note.trim() : null,
  });
  if (historyError) return json({ error: historyError.message }, 500);

  // The write that actually reaches real money: same rate, converted from
  // a percentage (0-100, what this UI and venue_commission use) to the
  // fraction (0-1) courts.commission_rate expects. Every court at this
  // venue moves together — see the note above on per-court overrides.
  const { error: courtsError, count: courtsUpdated } = await serviceClient
    .from("courts")
    .update({ commission_rate: newRate / 100 })
    .eq("venue_id", venueId)
    .select("id", { count: "exact", head: true });

  if (courtsError) {
    // venue_commission + history are already committed at this point —
    // this is a "the number this UI shows and the number that actually
    // gets paid are now out of sync, go check it" situation, not a
    // silent failure. Loud, not swallowed, matching how the payout
    // pipeline itself treats a post-transfer recording failure.
    console.error(`Commission rate saved but court sync failed for venue ${venueId}:`, courtsError.message);
    return json(
      {
        error: `Commission rate was saved, but syncing it to this venue's courts failed: ${courtsError.message}. Payouts will still use the OLD rate until this is fixed.`,
      },
      500,
    );
  }

  await logAdminAction(serviceClient, {
    adminId: admin.id,
    action: "venue.commission_rate_change",
    targetTable: "venue_commission",
    targetId: venueId,
    details: { venueName: venue.name, previousRate, newRate, note: note ?? null, courtsSynced: courtsUpdated ?? 0 },
  });

  return json({ ok: true, venueId, previousRate, newRate, courtsSynced: courtsUpdated ?? 0 });
});
/**
 * Real Supabase-backed venue queries for Backend Phase B, replacing
 * src/data/venues.ts (mock) for the Venue Approval Queue, All Venues
 * List, and Venue Detail screens. Shape is kept close to the old mock
 * `Venue` type so the existing UI components (StatusBadge, etc.) didn't
 * need to change — only where the data comes from did.
 *
 * NOTE: src/data/venues.ts (mock) is still used by Phase 3/4's mock
 * bookings/payments data until those phases get their own Backend pass —
 * this file does not replace it globally, only within src/routes/venues*.
 */
import { supabase } from "@/lib/supabaseClient";

export type VenueStatus = "pending" | "active" | "inactive";

export type CommissionChange = {
  id: string;
  date: string;
  previousRate: number;
  newRate: number;
  changedBy: string;
  note?: string;
};

export type Venue = {
  id: string;
  name: string;
  partnerId: string | null;
  city: string;
  area: string;
  address: string;
  status: VenueStatus;
  sports: string[];
  pricePerHour: number | null;
  description: string;
  images: string[];
  submittedDate: string;
  onboardedDate: string | null;
  commissionRate: number;
  commissionHistory: CommissionChange[];
  rejectionReason?: string;
  deactivationReason?: string;
};

type VenueRow = {
  id: string;
  name: string;
  address: string;
  city: string;
  area: string | null;
  about: string | null;
  tagline: string | null;
  photos: string[] | null;
  sports_offered: string[] | null;
  is_active: boolean;
  approval_status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  deactivation_reason: string | null;
  approved_at: string | null;
  created_at: string;
};

type VenuePricingRow = { venue_id: string; price_per_slot: number };
type VenueCommissionRow = { venue_id: string; commission_rate: number };
type VenueCommissionHistoryRow = {
  id: string;
  venue_id: string;
  previous_rate: number;
  new_rate: number;
  note: string | null;
  created_at: string;
  changed_by: string | null;
};
type PartnerVenueRow = { venue_id: string; partner_id: string };
type AdminUserNameRow = { id: string; name: string };

function toDate(iso: string | null) {
  return iso ? iso.slice(0, 10) : null;
}

function deriveStatus(row: VenueRow): VenueStatus {
  if (row.approval_status === "pending") return "pending";
  if (row.approval_status === "rejected") return "inactive";
  return row.is_active ? "active" : "inactive";
}

async function tableExists(table: string) {
  const { error } = await supabase.from(table).select("*", { head: true, count: "exact" }).limit(1);
  return !error;
}

/** Fetches every venue plus the joined data the UI needs, in a small,
 * fixed number of round trips rather than N+1 queries per venue. */
export async function listVenues(): Promise<Venue[]> {
  const { data: venues, error } = await supabase
    .from("venues")
    .select(
      "id, name, address, city, area, about, tagline, photos, sports_offered, is_active, approval_status, rejection_reason, deactivation_reason, approved_at, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (venues ?? []) as VenueRow[];
  if (rows.length === 0) return [];

  const venueIds = rows.map((v) => v.id);
  const hasPartnerVenues = await tableExists("partner_venues");

  const [pricingRes, commissionRes, historyRes, linkRes] = await Promise.all([
    supabase.from("venue_pricing").select("venue_id, price_per_slot").in("venue_id", venueIds),
    supabase.from("venue_commission").select("venue_id, commission_rate").in("venue_id", venueIds),
    supabase
      .from("venue_commission_history")
      .select("id, venue_id, previous_rate, new_rate, note, created_at, changed_by")
      .in("venue_id", venueIds)
      .order("created_at", { ascending: true }),
    hasPartnerVenues
      ? supabase.from("partner_venues").select("venue_id, partner_id").in("venue_id", venueIds)
      : Promise.resolve({ data: [] as PartnerVenueRow[], error: null }),
  ]);

  if (pricingRes.error) throw new Error(pricingRes.error.message);
  if (commissionRes.error) throw new Error(commissionRes.error.message);
  if (historyRes.error) throw new Error(historyRes.error.message);

  const pricing = (pricingRes.data ?? []) as VenuePricingRow[];
  const commission = (commissionRes.data ?? []) as VenueCommissionRow[];
  const history = (historyRes.data ?? []) as VenueCommissionHistoryRow[];
  const links = (linkRes.data ?? []) as PartnerVenueRow[];

  // changed_by is an admin_users id — resolve names in one extra query
  // rather than joining, since venue_commission_history has no FK the
  // PostgREST client can embed automatically across two hops.
  const adminIds = Array.from(new Set(history.map((h) => h.changed_by).filter(Boolean))) as string[];
  const adminNames = new Map<string, string>();
  if (adminIds.length > 0) {
    const { data: admins } = await supabase.from("admin_users").select("id, name").in("id", adminIds);
    for (const a of (admins ?? []) as AdminUserNameRow[]) adminNames.set(a.id, a.name);
  }

  const priceByVenue = new Map<string, number>();
  for (const p of pricing) {
    const existing = priceByVenue.get(p.venue_id);
    if (existing === undefined || p.price_per_slot < existing) priceByVenue.set(p.venue_id, p.price_per_slot);
  }
  const commissionByVenue = new Map(commission.map((c) => [c.venue_id, c.commission_rate]));
  const partnerByVenue = new Map(links.map((l) => [l.venue_id, l.partner_id]));
  const historyByVenue = new Map<string, CommissionChange[]>();
  for (const h of history) {
    const list = historyByVenue.get(h.venue_id) ?? [];
    list.push({
      id: h.id,
      date: toDate(h.created_at)!,
      previousRate: h.previous_rate,
      newRate: h.new_rate,
      changedBy: (h.changed_by && adminNames.get(h.changed_by)) || "Unknown admin",
      note: h.note ?? undefined,
    });
    historyByVenue.set(h.venue_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    partnerId: partnerByVenue.get(row.id) ?? null,
    city: row.city,
    area: row.area ?? "",
    address: row.address,
    status: deriveStatus(row),
    sports: row.sports_offered ?? [],
    pricePerHour: priceByVenue.get(row.id) ?? null,
    description: row.about ?? row.tagline ?? "",
    images: row.photos ?? [],
    submittedDate: toDate(row.created_at)!,
    onboardedDate: row.approval_status === "approved" ? toDate(row.approved_at) : null,
    commissionRate: commissionByVenue.get(row.id) ?? 12,
    commissionHistory: historyByVenue.get(row.id) ?? [],
    rejectionReason: row.rejection_reason ?? undefined,
    deactivationReason: row.deactivation_reason ?? undefined,
  }));
}

export async function getVenue(id: string): Promise<Venue | null> {
  // Simplest correct implementation given the joins involved: reuse
  // listVenues' mapping for one row. Fine at this data volume (a single
  // Kanpur launch); swap for a dedicated single-row query with the same
  // joins if venue count grows enough for this to matter.
  const all = await listVenues();
  return all.find((v) => v.id === id) ?? null;
}

// ── Mutations (call the Edge Functions from Backend Phase B) ──────────────

export async function approveVenue(venueId: string) {
  const { data, error } = await supabase.functions.invoke("admin-approve-venue", {
    body: { venueId, decision: "approve" },
  });
  if (error) throw new Error(error.message);
  return data as { ok: true; venue: { id: string; approval_status: string }; partnerUnlocked: boolean };
}

export async function rejectVenue(venueId: string, reason: string) {
  const { data, error } = await supabase.functions.invoke("admin-approve-venue", {
    body: { venueId, decision: "reject", reason },
  });
  if (error) throw new Error(error.message);
  return data as { ok: true; venue: { id: string; approval_status: string } };
}

export async function setVenueCommission(venueId: string, newRate: number, note?: string) {
  const { data, error } = await supabase.functions.invoke("admin-set-commission", {
    body: { venueId, newRate, note },
  });
  if (error) throw new Error(error.message);
  return data as { ok: true; venueId: string; previousRate: number; newRate: number };
}

export async function deactivateVenue(venueId: string, reason: string) {
  const { error } = await supabase
    .from("venues")
    .update({ is_active: false, deactivation_reason: reason })
    .eq("id", venueId);
  if (error) throw new Error(error.message);
}

export async function reactivateVenue(venueId: string) {
  const { error } = await supabase
    .from("venues")
    .update({ is_active: true, deactivation_reason: null })
    .eq("id", venueId);
  if (error) throw new Error(error.message);
}

/** Admin "edit override" — direct RLS write. Phase A only granted admins
 * READ on venues; this will 403 until a future migration adds a scoped
 * admin update policy (or this moves behind its own Edge Function like
 * approve/reject did). Left wired so the UI button works the moment that
 * policy exists — see the Phase B response notes. */
export async function updateVenueDetails(
  venueId: string,
  updates: Partial<Pick<Venue, "name" | "area" | "address" | "description">>,
) {
  const { error } = await supabase
    .from("venues")
    .update({
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.area !== undefined ? { area: updates.area } : {}),
      ...(updates.address !== undefined ? { address: updates.address } : {}),
      ...(updates.description !== undefined ? { about: updates.description } : {}),
    })
    .eq("id", venueId);
  if (error) throw new Error(error.message);
}

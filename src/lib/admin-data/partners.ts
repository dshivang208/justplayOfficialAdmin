/**
 * Real Supabase-backed partner queries for Backend Phase B, replacing
 * src/data/partners.ts (mock) for the Partner Directory screens.
 *
 * REAL SCHEMA (verified against the actual partner app migrations, not
 * guessed): public.partners is (id, phone, owner_name, business_name,
 * approval_status, created_at, flagged, flag_reason, flagged_by — the
 * last three added by the admin Phase B migration). There is NO email,
 * city, kyc_status, or payout_account_status column on this table — an
 * earlier version of this file assumed all four, which would have made
 * `listPartners()` fail outright (PostgREST "column does not exist")
 * against the real database. Fixed below by:
 *   - email: genuinely not collected anywhere in the partner signup flow
 *     yet. Left as `null` rather than fabricated — the UI shows "Not
 *     collected" instead of blank/fake text.
 *   - city: derived from the partner's own (owned) venue — venues have a
 *     city, partners don't.
 *   - kycStatus: DROPPED. There is no KYC concept, workflow, or column
 *     anywhere in the real schema — showing a permanently-fake "Pending"
 *     badge forever would be worse than not showing one. Add it back for
 *     real once an actual KYC feature exists to back it.
 *   - payoutAccountStatus: real backing DOES exist — it's
 *     `payout_accounts.verification_status` on the partner's owned
 *     venue(s) (Backend Phase D of the partner app), not a column on
 *     `partners` itself.
 *
 * "Staff members" also has real backing now: partner_venues rows with
 * role='staff' at a venue this partner owns, joined back to `partners`
 * for each staff member's own name/phone — the exact same shape the
 * partner app's own staff list (lib/staff.tsx) uses.
 */
import { supabase } from "@/lib/supabaseClient";

export type PayoutAccountStatus = "verified" | "pending" | "failed" | "not_linked";

export type StaffMember = { id: string; name: string; role: string; phone: string };

export type Partner = {
  id: string;
  businessName: string;
  ownerName: string;
  phone: string;
  /** Not collected by the partner app's signup flow today. */
  email: string | null;
  /** Derived from the partner's own (owned) venue, not stored on partners itself. */
  city: string;
  payoutAccountStatus: PayoutAccountStatus;
  venueIds: string[];
  staff: StaffMember[];
  joinedDate: string;
  flagged: boolean;
  flagReason?: string;
};

type PartnerRow = {
  id: string;
  business_name: string;
  owner_name: string;
  phone: string;
  approval_status: string;
  flagged: boolean | null;
  flag_reason: string | null;
  created_at: string;
};

type PartnerVenueRow = { partner_id: string; venue_id: string; role: "owner" | "staff" };
type VenueCityRow = { id: string; city: string };
type PayoutAccountRow = { venue_id: string; verification_status: PayoutAccountStatus };

async function tableExists(table: string) {
  const { error } = await supabase.from(table).select("*", { head: true, count: "exact" }).limit(1);
  return !error;
}

export async function listPartners(): Promise<Partner[]> {
  if (!(await tableExists("partners"))) return [];

  const { data: partners, error } = await supabase
    .from("partners")
    .select("id, business_name, owner_name, phone, approval_status, flagged, flag_reason, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (partners ?? []) as PartnerRow[];
  if (rows.length === 0) return [];

  const partnerIds = rows.map((p) => p.id);
  const hasPartnerVenues = await tableExists("partner_venues");

  const linksRes = hasPartnerVenues
    ? await supabase
        .from("partner_venues")
        .select("partner_id, venue_id, role")
        .in("partner_id", partnerIds)
    : { data: [] as PartnerVenueRow[], error: null };
  if (linksRes.error) throw new Error(linksRes.error.message);
  const links = (linksRes.data ?? []) as PartnerVenueRow[];

  // "Their venues" = venues they OWN, matching what the directory means by
  // "this partner's venue(s)" — a partner appearing with role='staff' at
  // someone else's venue (an edge case: a staff member who separately
  // signed up as their own owner elsewhere) doesn't count as one of THEIR
  // venues here.
  const ownedVenuesByPartner = new Map<string, string[]>();
  for (const link of links) {
    if (link.role !== "owner") continue;
    const list = ownedVenuesByPartner.get(link.partner_id) ?? [];
    list.push(link.venue_id);
    ownedVenuesByPartner.set(link.partner_id, list);
  }
  const allOwnedVenueIds = Array.from(new Set(links.filter((l) => l.role === "owner").map((l) => l.venue_id)));

  const [venuesRes, payoutRes] = await Promise.all([
    allOwnedVenueIds.length > 0
      ? supabase.from("venues").select("id, city").in("id", allOwnedVenueIds)
      : Promise.resolve({ data: [] as VenueCityRow[], error: null }),
    allOwnedVenueIds.length > 0 && (await tableExists("payout_accounts"))
      ? supabase.from("payout_accounts").select("venue_id, verification_status").in("venue_id", allOwnedVenueIds)
      : Promise.resolve({ data: [] as PayoutAccountRow[], error: null }),
  ]);
  if (venuesRes.error) throw new Error(venuesRes.error.message);
  if (payoutRes.error) throw new Error(payoutRes.error.message);

  const cityByVenue = new Map(((venuesRes.data ?? []) as VenueCityRow[]).map((v) => [v.id, v.city]));
  const payoutStatusByVenue = new Map(
    ((payoutRes.data ?? []) as PayoutAccountRow[]).map((p) => [p.venue_id, p.verification_status]),
  );

  // Staff at any of this partner's owned venues — same real table the
  // partner app's own staff list reads, joined back to `partners` for
  // each staff member's own profile.
  const staffLinks = links.filter((l) => l.role === "staff" && allOwnedVenueIds.includes(l.venue_id));
  const staffPartnerIds = Array.from(new Set(staffLinks.map((l) => l.partner_id)));
  const staffPartnersRes =
    staffPartnerIds.length > 0
      ? await supabase.from("partners").select("id, owner_name, phone").in("id", staffPartnerIds)
      : { data: [] as { id: string; owner_name: string; phone: string }[], error: null };
  if (staffPartnersRes.error) throw new Error(staffPartnersRes.error.message);
  const staffProfileById = new Map((staffPartnersRes.data ?? []).map((s) => [s.id, s]));

  const staffByVenue = new Map<string, StaffMember[]>();
  for (const link of staffLinks) {
    const profile = staffProfileById.get(link.partner_id);
    if (!profile) continue;
    const list = staffByVenue.get(link.venue_id) ?? [];
    list.push({ id: profile.id, name: profile.owner_name, role: "staff", phone: profile.phone });
    staffByVenue.set(link.venue_id, list);
  }

  return rows.map((row) => {
    const ownedVenueIds = ownedVenuesByPartner.get(row.id) ?? [];
    const firstVenueId = ownedVenueIds[0];
    const staff = ownedVenueIds.flatMap((vId) => staffByVenue.get(vId) ?? []);

    return {
      id: row.id,
      businessName: row.business_name,
      ownerName: row.owner_name,
      phone: row.phone,
      email: null,
      city: (firstVenueId && cityByVenue.get(firstVenueId)) || "",
      payoutAccountStatus: (firstVenueId && payoutStatusByVenue.get(firstVenueId)) || "not_linked",
      venueIds: ownedVenueIds,
      staff,
      joinedDate: row.created_at.slice(0, 10),
      flagged: row.flagged ?? false,
      flagReason: row.flag_reason ?? undefined,
    };
  });
}

export async function getPartner(id: string): Promise<Partner | null> {
  const all = await listPartners();
  return all.find((p) => p.id === id) ?? null;
}

// ── Mutations ────────────────────────────────────────────────────────────

export async function flagPartner(partnerId: string, reason: string) {
  const { data, error } = await supabase.functions.invoke("admin-flag-partner", {
    body: { partnerId, action: "flag", reason },
  });
  if (error) throw new Error(error.message);
  return data as { ok: true; partnerId: string; flagged: boolean };
}

export async function unflagPartner(partnerId: string) {
  const { data, error } = await supabase.functions.invoke("admin-flag-partner", {
    body: { partnerId, action: "unflag" },
  });
  if (error) throw new Error(error.message);
  return data as { ok: true; partnerId: string; flagged: boolean };
}
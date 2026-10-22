/**
 * Venue community groups — the optional "announcement group" a venue owner
 * can open for their venue. Admin decides, per venue, whether the owner is
 * allowed to use it at all (`venue_group_access.enabled`, off by default).
 *
 * Both calls go through SECURITY DEFINER RPCs that check the caller is an
 * admin server-side (see 20261023000000_venue_community_group.sql and the
 * follow-up 20261023020000_fix_venue_group_admin_gate.sql).
 */
import { supabase } from "@/lib/supabaseClient";

export type VenueGroupAccessRow = {
  venueId: string;
  venueName: string;
  area: string | null;
  enabled: boolean;
  hasGroup: boolean;
  groupName: string | null;
  /** Owner's own pause switch; null when no group exists. */
  groupActive: boolean | null;
  memberCount: number;
  updatedAt: string | null;
};

type Row = {
  venue_id: string;
  venue_name: string;
  area: string | null;
  enabled: boolean;
  has_group: boolean;
  group_name: string | null;
  group_active: boolean | null;
  member_count: number | string;
  updated_at: string | null;
};

export async function listVenueGroupAccess(): Promise<VenueGroupAccessRow[]> {
  const { data, error } = await supabase.rpc("admin_list_venue_group_access");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map((r) => ({
    venueId: r.venue_id,
    venueName: r.venue_name,
    area: r.area,
    enabled: r.enabled,
    hasGroup: r.has_group,
    groupName: r.group_name,
    groupActive: r.group_active,
    memberCount: Number(r.member_count ?? 0),
    updatedAt: r.updated_at,
  }));
}

export async function setVenueGroupAccess(venueId: string, enabled: boolean) {
  const { error } = await supabase.rpc("admin_set_venue_group_access", {
    p_venue_id: venueId,
    p_enabled: enabled,
  });
  if (error) {
    throw new Error(
      error.message.includes("NOT_ALLOWED")
        ? "You don't have permission to change this."
        : error.message.includes("VENUE_NOT_FOUND")
          ? "That venue no longer exists."
          : error.message,
    );
  }
}

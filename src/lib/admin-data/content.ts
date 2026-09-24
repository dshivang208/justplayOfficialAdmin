/**
 * Real Supabase-backed featured-content queries for Backend Phase E,
 * replacing src/data/featured.ts (mock).
 *
 * Each content type keeps its own is_featured/featured_order columns
 * (Phase E migration) rather than one generic table — see the migration
 * comment for why. admin_set_featured/admin_reorder_featured are the only
 * write path for any of them.
 */
import { supabase } from "@/lib/supabaseClient";

export type CommunityContentType = "hosted_game" | "group" | "event";

export type FeaturedVenue = {
  id: string;
  name: string;
  area: string | null;
  city: string;
  isFeatured: boolean;
  featuredOrder: number | null;
};

export type CommunityContentItem = {
  id: string;
  type: CommunityContentType;
  title: string;
  subtitle: string;
  isFeatured: boolean;
  featuredOrder: number | null;
};

type VenueRow = {
  id: string;
  name: string;
  area: string | null;
  city: string;
  is_active: boolean;
  is_featured: boolean;
  featured_order: number | null;
};

type GameRow = {
  id: string;
  sport: string;
  date: string;
  time: string;
  is_featured: boolean;
  featured_order: number | null;
  users: { name: string } | null;
  venues: { name: string } | null;
};

type GroupRow = {
  id: string;
  name: string;
  sport: string;
  member_count: number;
  is_featured: boolean;
  featured_order: number | null;
};

type EventRow = {
  id: string;
  title: string;
  date: string;
  sport: string;
  is_featured: boolean;
  featured_order: number | null;
  venues: { name: string } | null;
};

export async function listFeaturedVenues(): Promise<FeaturedVenue[]> {
  const { data, error } = await supabase
    .from("venues")
    .select("id, name, area, city, is_active, is_featured, featured_order")
    .eq("is_active", true)
    .order("name")
    .returns<VenueRow[]>();
  if (error) throw new Error(error.message);

  return (data ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    area: v.area,
    city: v.city,
    isFeatured: v.is_featured,
    featuredOrder: v.featured_order,
  }));
}

export async function listCommunityContent(): Promise<CommunityContentItem[]> {
  const [gamesRes, groupsRes, eventsRes] = await Promise.all([
    supabase
      .from("hosted_games")
      .select("id, sport, date, time, is_featured, featured_order, users(name), venues(name)")
      .eq("status", "active")
      .returns<GameRow[]>(),
    supabase
      .from("groups")
      .select("id, name, sport, member_count, is_featured, featured_order")
      .returns<GroupRow[]>(),
    supabase
      .from("events")
      .select("id, title, date, sport, is_featured, featured_order, venues(name)")
      .returns<EventRow[]>(),
  ]);
  if (gamesRes.error) throw new Error(gamesRes.error.message);
  if (groupsRes.error) throw new Error(groupsRes.error.message);
  if (eventsRes.error) throw new Error(eventsRes.error.message);

  const games: CommunityContentItem[] = (gamesRes.data ?? []).map((g) => ({
    id: g.id,
    type: "hosted_game",
    title: `${g.sport} \u2014 ${g.date}`,
    subtitle: `${g.venues?.name ?? "Unknown venue"} \u00b7 Hosted by ${g.users?.name ?? "Unknown"}`,
    isFeatured: g.is_featured,
    featuredOrder: g.featured_order,
  }));
  const groups: CommunityContentItem[] = (groupsRes.data ?? []).map((gr) => ({
    id: gr.id,
    type: "group",
    title: gr.name,
    subtitle: `${gr.member_count} members \u00b7 ${gr.sport}`,
    isFeatured: gr.is_featured,
    featuredOrder: gr.featured_order,
  }));
  const events: CommunityContentItem[] = (eventsRes.data ?? []).map((e) => ({
    id: e.id,
    type: "event",
    title: e.title,
    subtitle: `${e.venues?.name ?? "Unknown venue"} \u00b7 ${e.date}`,
    isFeatured: e.is_featured,
    featuredOrder: e.featured_order,
  }));

  return [...games, ...groups, ...events];
}

// ── Mutations ────────────────────────────────────────────────────────────

export async function setFeatured(
  contentType: "venue" | CommunityContentType,
  id: string,
  featured: boolean,
  order: number | null = null,
) {
  const { error } = await supabase.rpc("admin_set_featured", {
    p_content_type: contentType,
    p_id: id,
    p_featured: featured,
    p_order: order,
  });
  if (error) throw new Error(error.message);
}

export async function reorderFeatured(contentType: "venue" | CommunityContentType, id: string, order: number) {
  const { error } = await supabase.rpc("admin_reorder_featured", {
    p_content_type: contentType,
    p_id: id,
    p_order: order,
  });
  if (error) throw new Error(error.message);
}
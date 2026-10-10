/**
 * Venue change requests — a partner asking to change their venue's public
 * name or address. These used to disappear: the Partner app saved the
 * request on the venue row and told the owner it was "sent for review",
 * but nothing in Admin ever read it. See migration
 * 20260920000000_venue_change_requests.sql.
 */
import { supabase } from "@/lib/supabaseClient";

export type VenueChangeRequest = {
  venueId: string;
  venueName: string;
  venueAddress: string;
  city: string;
  businessName: string | null;
  /** null = the partner isn't changing that field */
  pendingName: string | null;
  pendingAddress: string | null;
  requestedAt: string | null;
};

type RequestRow = {
  venue_id: string;
  venue_name: string;
  venue_address: string;
  city: string;
  business_name: string | null;
  pending_name: string | null;
  pending_address: string | null;
  requested_at: string | null;
};

const ERRORS: Record<string, string> = {
  NOT_ALLOWED: "You don't have permission to review venue changes.",
  VENUE_NOT_FOUND: "That venue no longer exists.",
  NO_PENDING_CHANGE: "This request was already handled — refresh to see the latest.",
  REASON_REQUIRED: "Give the partner a short reason (at least a few words) — they'll see it.",
  REASON_TOO_LONG: "That reason is too long (500 characters max).",
};

function friendly(error: { message: string }) {
  return new Error(ERRORS[error.message] ?? error.message);
}

export async function listVenueChangeRequests(): Promise<VenueChangeRequest[]> {
  const { data, error } = await supabase.rpc("admin_list_venue_change_requests");
  if (error) throw friendly(error);
  return ((data ?? []) as RequestRow[]).map((r) => ({
    venueId: r.venue_id,
    venueName: r.venue_name,
    venueAddress: r.venue_address,
    city: r.city,
    businessName: r.business_name,
    pendingName: r.pending_name,
    pendingAddress: r.pending_address,
    requestedAt: r.requested_at,
  }));
}

export async function approveVenueChangeRequest(venueId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_approve_venue_change_request", { p_venue_id: venueId });
  if (error) throw friendly(error);
}

export async function rejectVenueChangeRequest(venueId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("admin_reject_venue_change_request", {
    p_venue_id: venueId,
    p_reason: reason.trim(),
  });
  if (error) throw friendly(error);
}

export type ReviewCounts = { pendingVenues: number; pendingChangeRequests: number };

/** Counts for the sidebar badge, dashboard card and alerts. Goes through an
 *  admin-only function because `venues.approval_status` is no longer
 *  readable straight off the table (see 20260915 privacy migration) — the
 *  old `.eq("approval_status", "pending")` counts came back 0 every time.
 *  Returns zeros rather than throwing so a count failure never blanks a
 *  whole page; the error is logged. */
export async function getReviewCounts(): Promise<ReviewCounts> {
  const { data, error } = await supabase.rpc("admin_pending_review_counts").maybeSingle<{
    pending_venues: number;
    pending_change_requests: number;
  }>();
  if (error || !data) {
    if (error) console.error("getReviewCounts failed:", error.message);
    return { pendingVenues: 0, pendingChangeRequests: 0 };
  }
  return { pendingVenues: data.pending_venues, pendingChangeRequests: data.pending_change_requests };
}
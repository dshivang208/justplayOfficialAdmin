-- ============================================================================
-- JustPlay Admin — fix: "permission denied for table venues" on the Venue
-- & Partner Management screen
-- ============================================================================
-- Caused by the Consumer-side fix in 20260915000000_venues_private_columns
-- .sql: it narrowed anon/authenticated SELECT on `venues` to an explicit
-- public-safe allow-list (the only way to actually stop the GST-number/
-- legal-business-name leak — see that migration's own notes). That
-- migration's comments already flagged, as a known follow-up, that
-- Admin's listVenues() reads four moderation-only columns (approval_status,
-- rejection_reason, deactivation_reason, approved_at) directly off the raw
-- table as the same shared `authenticated` role — none of which belong in
-- a PUBLIC allow-list, so listVenues()'s one `select(...)` call started
-- failing outright the moment that migration landed.
--
-- Fix: the exact same pattern already used for Partner's private business
-- fields (partner_get_venue_private_details) — an is_admin()-gated
-- SECURITY DEFINER function, with listVenues() fetching these four columns
-- through it instead of the raw table. Set-returning (every venue at once,
-- no parameters) rather than one-venue-at-a-time, since listVenues() always
-- wants every venue's moderation fields together — matches this app's
-- existing "small Kanpur-scale deployment, no pagination" convention.
--
-- Safe to re-run.
-- ============================================================================

create or replace function public.admin_get_venue_moderation_fields()
returns table (
  venue_id uuid,
  approval_status text,
  rejection_reason text,
  deactivation_reason text,
  approved_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  return query
  select v.id, v.approval_status, v.rejection_reason, v.deactivation_reason, v.approved_at
  from public.venues v;
end;
$$;

grant execute on function public.admin_get_venue_moderation_fields() to authenticated;
-- ============================================================================
-- JustPlay — venue change requests: Partner -> Admin, end to end
-- ============================================================================
-- A partner changing their venue's name or address is told "sent for review,
-- usually 1-2 business days". What actually happened: partner_submit_venue_
-- major_change wrote pending_name / pending_address on the venue row, and
-- that was the end of it. The only approver, admin_approve_venue_change
-- (Partner Phase E), is granted to service_role only ("SQL editor today,
-- real admin UI later") and nothing in the Admin app ever read those
-- columns — no queue, no count, no alert, no reject. Requests were
-- invisible and could never be answered, and a partner got no way to learn
-- they'd been declined.
--
-- This adds:
--   * a timestamp on each request, so the queue can show how long it has
--     been waiting
--   * a rejection reason the partner can see
--   * is_admin()-gated list / approve / reject functions for the Admin app
--   * admin_pending_review_counts() — ALSO fixes a regression from the
--     20260915 privacy migration: Admin's "pending venue approvals" dashboard
--     card and alert counted venues with `where approval_status = 'pending'`,
--     but approval_status is no longer in the public column allow-list, and
--     Postgres needs SELECT on a column to filter by it — so both counts
--     have silently been 0 since then.
--   * the Partner functions that write/clear the request, updated to keep
--     the new columns correct (and to stop blank names/addresses reaching
--     the queue)
-- Safe to re-run.
-- ============================================================================

alter table public.venues
  add column if not exists pending_change_requested_at timestamptz,
  add column if not exists pending_change_rejection_reason text;

-- Requests already waiting have no recorded time; "now" is the honest
-- floor (the queue then shows them as new rather than inventing an age).
update public.venues
set pending_change_requested_at = now()
where (pending_name is not null or pending_address is not null)
  and pending_change_requested_at is null;

-- Stamp the time automatically whenever the pending values change, however
-- they got written, so no caller has to remember to.
create or replace function public.trg_venues_stamp_pending_change()
returns trigger
language plpgsql
as $$
begin
  if new.pending_name is not null or new.pending_address is not null then
    if new.pending_name is distinct from old.pending_name
       or new.pending_address is distinct from old.pending_address then
      new.pending_change_requested_at := now();
      new.pending_change_rejection_reason := null; -- a fresh request supersedes an old refusal
    end if;
  else
    new.pending_change_requested_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists venues_stamp_pending_change on public.venues;
create trigger venues_stamp_pending_change
  before update of pending_name, pending_address on public.venues
  for each row
  execute function public.trg_venues_stamp_pending_change();

-- ----------------------------------------------------------------------------
-- Partner side
-- ----------------------------------------------------------------------------

-- Same as before (owner-only, NULL-safe) plus: trim, and ignore a blank
-- name/address instead of queueing an empty request for an admin to read.
create or replace function public.partner_submit_venue_major_change(
  p_venue_id uuid,
  p_name     text default null,
  p_address  text default null
)
returns public.venues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue   public.venues;
  v_name    text := nullif(btrim(coalesce(p_name, '')), '');
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
begin
  if public.partner_role_for_venue(p_venue_id) is distinct from 'owner' then
    raise exception 'NOT_ALLOWED';
  end if;

  if v_name is not null and char_length(v_name) > 120 then raise exception 'NAME_TOO_LONG'; end if;
  if v_address is not null and char_length(v_address) > 300 then raise exception 'ADDRESS_TOO_LONG'; end if;

  update public.venues
  set pending_name = case
        when v_name is not null and v_name <> name then v_name
        else pending_name
      end,
      pending_address = case
        when v_address is not null and v_address <> address then v_address
        else pending_address
      end
  where id = p_venue_id
  returning * into v_venue;

  if v_venue.id is null then
    raise exception 'VENUE_NOT_FOUND';
  end if;

  return v_venue;
end;
$$;

-- Discarding (or dismissing a "declined" notice) also clears the reason, so
-- an old refusal can't reappear later.
create or replace function public.partner_discard_venue_pending_change(p_venue_id uuid)
returns public.venues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue public.venues;
begin
  if public.partner_role_for_venue(p_venue_id) is distinct from 'owner' then
    raise exception 'NOT_ALLOWED';
  end if;

  update public.venues
  set pending_name = null,
      pending_address = null,
      pending_change_rejection_reason = null
  where id = p_venue_id
  returning * into v_venue;

  if v_venue.id is null then
    raise exception 'VENUE_NOT_FOUND';
  end if;

  return v_venue;
end;
$$;

-- Return type changes (two new columns), so the old definition has to go.
drop function if exists public.partner_get_venue_private_details(uuid);
create function public.partner_get_venue_private_details(p_venue_id uuid)
returns table (
  legal_business_name text,
  gst_number text,
  pending_name text,
  pending_address text,
  pending_change_requested_at timestamptz,
  pending_change_rejection_reason text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.partner_role_for_venue(p_venue_id) is null then
    raise exception 'NOT_ALLOWED';
  end if;

  return query
  select v.legal_business_name, v.gst_number, v.pending_name, v.pending_address,
         v.pending_change_requested_at, v.pending_change_rejection_reason
  from public.venues v
  where v.id = p_venue_id;
end;
$$;

grant execute on function public.partner_get_venue_private_details(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Admin side — any admin role, same is_admin() gate as the rest of /venues
-- ----------------------------------------------------------------------------

create or replace function public.admin_list_venue_change_requests()
returns table (
  venue_id uuid,
  venue_name text,
  venue_address text,
  city text,
  business_name text,
  pending_name text,
  pending_address text,
  requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;

  return query
  select v.id, v.name, v.address, v.city, v.legal_business_name,
         v.pending_name, v.pending_address, v.pending_change_requested_at
  from public.venues v
  where v.pending_name is not null or v.pending_address is not null
  order by v.pending_change_requested_at asc nulls last;
end;
$$;

grant execute on function public.admin_list_venue_change_requests() to authenticated;

create or replace function public.admin_approve_venue_change_request(p_venue_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue   public.venues;
  v_name    text;
  v_address text;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;

  select * into v_venue from public.venues where id = p_venue_id for update;
  if v_venue.id is null then raise exception 'VENUE_NOT_FOUND'; end if;
  if v_venue.pending_name is null and v_venue.pending_address is null then
    raise exception 'NO_PENDING_CHANGE';
  end if;

  v_name    := nullif(btrim(coalesce(v_venue.pending_name, '')), '');
  v_address := nullif(btrim(coalesce(v_venue.pending_address, '')), '');

  update public.venues
  set name = coalesce(v_name, name),
      address = coalesce(v_address, address),
      pending_name = null,
      pending_address = null,
      pending_change_rejection_reason = null
  where id = p_venue_id;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
  values (
    auth.uid(), 'venue.change_approved', 'venues', p_venue_id::text,
    jsonb_build_object(
      'name_from', v_venue.name, 'name_to', coalesce(v_name, v_venue.name),
      'address_from', v_venue.address, 'address_to', coalesce(v_address, v_venue.address)
    )
  );
end;
$$;

grant execute on function public.admin_approve_venue_change_request(uuid) to authenticated;

create or replace function public.admin_reject_venue_change_request(p_venue_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue  public.venues;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  -- The partner is shown this reason; "no explanation" isn't a useful answer.
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'REASON_REQUIRED'; end if;
  if char_length(v_reason) > 500 then raise exception 'REASON_TOO_LONG'; end if;

  select * into v_venue from public.venues where id = p_venue_id for update;
  if v_venue.id is null then raise exception 'VENUE_NOT_FOUND'; end if;
  if v_venue.pending_name is null and v_venue.pending_address is null then
    raise exception 'NO_PENDING_CHANGE';
  end if;

  update public.venues
  set pending_name = null,
      pending_address = null,
      pending_change_rejection_reason = v_reason
  where id = p_venue_id;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
  values (
    auth.uid(), 'venue.change_rejected', 'venues', p_venue_id::text,
    jsonb_build_object(
      'requested_name', v_venue.pending_name, 'requested_address', v_venue.pending_address,
      'reason', v_reason
    )
  );
end;
$$;

grant execute on function public.admin_reject_venue_change_request(uuid, text) to authenticated;

-- One call for the numbers the sidebar badge, dashboard card and alerts need.
create or replace function public.admin_pending_review_counts()
returns table (pending_venues integer, pending_change_requests integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;

  return query
  select
    (count(*) filter (where v.approval_status = 'pending'))::integer,
    (count(*) filter (where v.pending_name is not null or v.pending_address is not null))::integer
  from public.venues v;
end;
$$;

grant execute on function public.admin_pending_review_counts() to authenticated;
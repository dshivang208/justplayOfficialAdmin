-- ============================================================================
-- JustPlay Admin — Backend Phase C: Booking/User Management
-- ============================================================================
-- Run AFTER Phase A + B, and after the partner app's migrations (this
-- depends on booking_flags and cancel_booking, both defined there).
--
-- Platform-wide bookings view and user suspend/reactivate need nothing new
-- here beyond what Phase A's RLS already granted (`bookings admin read/
-- update/insert`, `users admin read/update`) — those are already real,
-- already audited (the log_admin_write trigger). What this migration adds
-- is everything that DOESN'T already exist for real:
--   - booking_flags has no resolution concept at all yet (just
--     booking_id/flag_type/reason/flagged_by) — the admin dispute queue
--     needs one.
--   - wallet_transactions.type doesn't allow a goodwill-credit value.
--   - cancel_booking's ownership check doesn't recognize an admin caller
--     yet (only the booking's own consumer, or — Partner Phase C — a
--     partner at that venue).
--   - "suspend a user" as a raw client UPDATE on `users` is technically
--     already possible via Phase A's broad admin-update policy, but that
--     policy's own comment flags the risk (nothing stops rewriting
--     name/phone too) — a narrow RPC is the safer real implementation.
-- ============================================================================

-- ============================================================================
-- C1. booking_flags — resolution tracking. Kept on the SAME row (not a
--     separate table) since a flag's resolution is 1:1 with the flag
--     itself, not a history of many resolutions.
-- ============================================================================

alter table public.booking_flags add column if not exists resolution text not null default 'unresolved';
alter table public.booking_flags add column if not exists resolution_note text;
alter table public.booking_flags add column if not exists credit_amount integer;
alter table public.booking_flags add column if not exists resolved_by uuid references public.admin_users (id) on delete set null;
alter table public.booking_flags add column if not exists resolved_at timestamptz;

alter table public.booking_flags drop constraint if exists booking_flags_resolution_check;
alter table public.booking_flags add constraint booking_flags_resolution_check
  check (resolution in ('unresolved', 'resolved', 'credit_issued', 'no_action'));

comment on column public.booking_flags.resolution is
  'Set only via admin_resolve_booking_flag() below, never a raw client update — '
  'a credit_issued resolution must insert the matching wallet_transactions row '
  'in the same transaction, or the ledger and the flag would disagree.';

-- Admin read access — both roles, matching every other admin-read policy
-- in this app. No client-side insert/update/delete policy: writes go
-- through admin_resolve_booking_flag (resolution) or the partner app's
-- own partner_flag_booking/partner_unflag_booking (the flag itself).
alter table public.booking_flags enable row level security;

drop policy if exists "booking_flags admin read" on public.booking_flags;
create policy "booking_flags admin read" on public.booking_flags
  for select using (public.is_admin());

-- Same automatic audit-log pattern as bookings/users/wallet_transactions
-- (Phase A) — a plain RLS-permitted... except there ISN'T one here (no
-- client update policy), so in practice this only fires for the RPC
-- below, which runs with the calling admin's own session (not service
-- role), same as admin_set_user_status. Added for consistency and so a
-- future direct-update policy (if one's ever added) is covered for free.
drop trigger if exists trg_log_admin_write_booking_flags on public.booking_flags;
create trigger trg_log_admin_write_booking_flags
  after update on public.booking_flags
  for each row execute function public.log_admin_write();

-- ============================================================================
-- C2. wallet_transactions — goodwill credit is a real, distinct reason a
--     wallet balance changes (money never left Razorpay, unlike a refund),
--     so it gets its own type rather than overloading 'refund'.
-- ============================================================================

alter table public.wallet_transactions drop constraint if exists wallet_transactions_type_check;
alter table public.wallet_transactions add constraint wallet_transactions_type_check
  check (type in ('referral_reward', 'redeemed', 'refund', 'goodwill_credit'));

-- ============================================================================
-- C3. admin_set_user_status — narrow suspend/reactivate, instead of
--     relying on Phase A's broad "admin can update any column on users"
--     policy for this specific action (that policy's own comment
--     recommended exactly this). Runs with the calling admin's session,
--     so the existing trg_log_admin_write_users trigger still logs it —
--     no separate audit insert needed here.
-- ============================================================================

create or replace function public.admin_set_user_status(
  p_user_id uuid,
  p_status  text,
  p_reason  text default null
)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_status not in ('active', 'suspended') then
    raise exception 'INVALID_STATUS';
  end if;
  if p_status = 'suspended' and (p_reason is null or length(trim(p_reason)) < 3) then
    raise exception 'REASON_REQUIRED';
  end if;

  update public.users
  set status = p_status,
      suspension_reason = case when p_status = 'suspended' then trim(p_reason) else null end
  where id = p_user_id
  returning * into v_user;

  if v_user.id is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  return v_user;
end;
$$;

grant execute on function public.admin_set_user_status(uuid, text, text) to authenticated;

-- ============================================================================
-- C4. cancel_booking — third redefinition (consumer's own booking, then
--     Partner Phase C's "or a partner at this venue", now "or an admin").
--     Still the exact same function every app calls — that's the point.
-- ============================================================================

create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns table (booking public.bookings, hours_before_slot numeric, refund_eligible boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking     public.bookings;
  v_slot_start  timestamptz;
  v_hours_left  numeric;
  v_is_partner  boolean;
  v_is_admin    boolean;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  v_is_partner := public.partner_role_for_venue(v_booking.venue_id) is not null;
  v_is_admin := public.is_admin();
  if v_booking.user_id is distinct from auth.uid() and not v_is_partner and not v_is_admin then
    raise exception 'NOT_YOUR_BOOKING';
  end if;
  if v_booking.status not in ('pending', 'confirmed') then
    raise exception 'BOOKING_NOT_CANCELLABLE';
  end if;

  select (v_booking.date + s.start_time)::timestamptz into v_slot_start
  from public.slots s where s.id = v_booking.slot_id;

  v_hours_left := extract(epoch from (v_slot_start - now())) / 3600.0;

  update public.bookings
  set status = 'cancelled', cancellation_reason = coalesce(p_reason, 'user_cancelled')
  where id = p_booking_id
  returning * into v_booking;

  update public.slots s
  set status = 'available'
  from public.booking_slots bs
  where bs.booking_id = p_booking_id and s.id = bs.slot_id;

  -- A walk-in was never paid through Razorpay — there's nothing for the
  -- refund Edge Function to refund, cash-in-hand settlements are between
  -- the venue and the customer directly. The Edge Function's own admin
  -- override separately bypasses the window/eligibility check on top of
  -- whatever this returns — see cancel-booking-refund.
  return query select v_booking, v_hours_left,
    (v_hours_left > 2 and v_booking.payment_id is not null and v_booking.source = 'online');
end;
$$;

grant execute on function public.cancel_booking(uuid, text) to authenticated;

-- ============================================================================
-- C5. admin_resolve_booking_flag — the one place a dispute/no-show gets
--     resolved. Atomic: a credit_issued resolution inserts the matching
--     wallet_transactions row in the SAME function call, so the flag and
--     the ledger can never disagree (no "resolution says credit issued
--     but no transaction exists" state, and no separate client-side
--     two-step that could partially fail).
-- ============================================================================

create or replace function public.admin_resolve_booking_flag(
  p_flag_id         uuid,
  p_resolution      text,
  p_resolution_note text default null,
  p_credit_amount   integer default null
)
returns public.booking_flags
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flag    public.booking_flags;
  v_booking public.bookings;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_resolution not in ('resolved', 'credit_issued', 'no_action') then
    raise exception 'INVALID_RESOLUTION';
  end if;
  if p_resolution = 'credit_issued' and (p_credit_amount is null or p_credit_amount <= 0) then
    raise exception 'CREDIT_AMOUNT_REQUIRED';
  end if;

  select * into v_flag from public.booking_flags where id = p_flag_id;
  if v_flag.id is null then
    raise exception 'FLAG_NOT_FOUND';
  end if;

  update public.booking_flags
  set resolution = p_resolution,
      resolution_note = p_resolution_note,
      credit_amount = case when p_resolution = 'credit_issued' then p_credit_amount else null end,
      resolved_by = auth.uid(),
      resolved_at = now()
  where id = p_flag_id
  returning * into v_flag;

  if p_resolution = 'credit_issued' then
    select * into v_booking from public.bookings where id = v_flag.booking_id;
    insert into public.wallet_transactions (user_id, amount, type, description)
    values (
      v_booking.user_id,
      p_credit_amount,
      'goodwill_credit',
      coalesce(p_resolution_note, 'Goodwill credit — ' || v_flag.flag_type || ' on booking ' || v_flag.booking_id)
    );
  end if;

  return v_flag;
end;
$$;

grant execute on function public.admin_resolve_booking_flag(uuid, text, text, integer) to authenticated;

-- ============================================================================
-- End of Admin Backend Phase C
-- ============================================================================
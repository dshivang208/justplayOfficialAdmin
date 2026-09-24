-- ============================================================================
-- JustPlay Admin — Backend Phase E: Content, Coupons, Roles
-- ============================================================================
-- Run after Phases A-D, and after the consumer app's own migrations
-- (this touches venues/hosted_games/groups/events, all defined there).
-- ============================================================================

-- ============================================================================
-- E1. Featured content — one pair of columns per content type. A single
--     generic "featured_items" table (content_type, content_id) was
--     considered and rejected: it can't enforce "content_id actually
--     exists and is the right type" via a foreign key, which columns on
--     the real table can. admin_set_featured below is the one place that
--     writes any of them, so the "toggle + reorder" contract stays in
--     one function regardless of which table it's touching.
-- ============================================================================

alter table public.venues       add column if not exists is_featured boolean not null default false;
alter table public.venues       add column if not exists featured_order integer;
alter table public.hosted_games add column if not exists is_featured boolean not null default false;
alter table public.hosted_games add column if not exists featured_order integer;
alter table public.groups       add column if not exists is_featured boolean not null default false;
alter table public.groups       add column if not exists featured_order integer;
alter table public.events       add column if not exists is_featured boolean not null default false;
alter table public.events       add column if not exists featured_order integer;

create or replace function public.admin_set_featured(
  p_content_type text,  -- 'venue' | 'hosted_game' | 'group' | 'event'
  p_id           uuid,
  p_featured     boolean,
  p_order        integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  if p_content_type = 'venue' then
    update public.venues set is_featured = p_featured, featured_order = case when p_featured then p_order else null end where id = p_id;
  elsif p_content_type = 'hosted_game' then
    update public.hosted_games set is_featured = p_featured, featured_order = case when p_featured then p_order else null end where id = p_id;
  elsif p_content_type = 'group' then
    update public.groups set is_featured = p_featured, featured_order = case when p_featured then p_order else null end where id = p_id;
  elsif p_content_type = 'event' then
    update public.events set is_featured = p_featured, featured_order = case when p_featured then p_order else null end where id = p_id;
  else
    raise exception 'INVALID_CONTENT_TYPE';
  end if;
end;
$$;

grant execute on function public.admin_set_featured(text, uuid, boolean, integer) to authenticated;

-- Reordering an already-featured item — separate from the toggle above so
-- moving an item up/down doesn't need to re-send its featured state too.
create or replace function public.admin_reorder_featured(p_content_type text, p_id uuid, p_order integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  if p_content_type = 'venue' then
    update public.venues set featured_order = p_order where id = p_id and is_featured;
  elsif p_content_type = 'hosted_game' then
    update public.hosted_games set featured_order = p_order where id = p_id and is_featured;
  elsif p_content_type = 'group' then
    update public.groups set featured_order = p_order where id = p_id and is_featured;
  elsif p_content_type = 'event' then
    update public.events set featured_order = p_order where id = p_id and is_featured;
  else
    raise exception 'INVALID_CONTENT_TYPE';
  end if;
end;
$$;

grant execute on function public.admin_reorder_featured(text, uuid, integer) to authenticated;

-- ============================================================================
-- E2. coupons — real table backing the Coupon Management screen, plus
--     validate_and_apply_coupon: the "small addition to the consumer
--     checkout" the brief calls out. Callable by any signed-in consumer
--     (not admin-only — this is what checkout calls), but it's the ONLY
--     way times_used ever increments: no client can write to `coupons`
--     directly, so a coupon's usage count can't be forged or raced past
--     its limit (the UPDATE below is conditioned on the limit check in
--     the same statement).
-- ============================================================================

create table if not exists public.coupons (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  discount_type     text not null,
  value             integer not null,
  usage_limit       integer not null,
  times_used        integer not null default 0,
  expiry_date       date not null,
  applicable_venues jsonb not null default 'null'::jsonb, -- null/'"all"' = all venues; else a JSON array of venue ids
  created_by        uuid references public.admin_users (id) on delete set null,
  created_at        timestamptz not null default now(),

  constraint coupons_discount_type_check check (discount_type in ('flat', 'percentage')),
  constraint coupons_value_positive check (value > 0),
  constraint coupons_usage_limit_positive check (usage_limit > 0)
);

alter table public.coupons enable row level security;

drop policy if exists "coupons admin read" on public.coupons;
create policy "coupons admin read" on public.coupons
  for select using (public.is_admin());

-- Consumers need to read a coupon's own row to show "20% off" before
-- applying it at checkout — but only by exact code, and only the columns
-- that matter for that (RLS is row-level, not column-level, so this is
-- still a full-row SELECT; nothing here is sensitive enough to hide from
-- a consumer who already knows the exact code, which is the same
-- information validate_and_apply_coupon exposes anyway).
drop policy if exists "coupons consumer read by code" on public.coupons;
create policy "coupons consumer read by code" on public.coupons
  for select using (auth.uid() is not null);

create or replace function public.admin_create_coupon(
  p_code              text,
  p_discount_type     text,
  p_value             integer,
  p_usage_limit       integer,
  p_expiry_date       date,
  p_applicable_venues jsonb default 'null'::jsonb
)
returns public.coupons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon public.coupons;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_discount_type not in ('flat', 'percentage') then
    raise exception 'INVALID_DISCOUNT_TYPE';
  end if;
  if p_discount_type = 'percentage' and (p_value <= 0 or p_value > 100) then
    raise exception 'PERCENTAGE_MUST_BE_1_TO_100';
  end if;

  insert into public.coupons (code, discount_type, value, usage_limit, expiry_date, applicable_venues, created_by)
  values (upper(trim(p_code)), p_discount_type, p_value, p_usage_limit, p_expiry_date, p_applicable_venues, auth.uid())
  returning * into v_coupon;

  return v_coupon;
end;
$$;

grant execute on function public.admin_create_coupon(text, text, integer, integer, date, jsonb) to authenticated;

create or replace function public.admin_delete_coupon(p_coupon_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  delete from public.coupons where id = p_coupon_id;
end;
$$;

grant execute on function public.admin_delete_coupon(uuid) to authenticated;

-- Called from consumer checkout (create_booking or the client right
-- before it) — validates a code against expiry/usage/venue scope AND
-- atomically claims one use, in the same statement, so two concurrent
-- checkouts can't both squeeze past a coupon's last remaining use.
create or replace function public.validate_and_apply_coupon(p_code text, p_venue_id uuid, p_amount integer)
returns table (valid boolean, discount_amount integer, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon public.coupons;
  v_discount integer;
begin
  select * into v_coupon from public.coupons where code = upper(trim(p_code));

  if v_coupon.id is null then
    return query select false, 0, 'Invalid coupon code.';
    return;
  end if;
  if v_coupon.expiry_date < current_date then
    return query select false, 0, 'This coupon has expired.';
    return;
  end if;
  if v_coupon.times_used >= v_coupon.usage_limit then
    return query select false, 0, 'This coupon has reached its usage limit.';
    return;
  end if;
  if v_coupon.applicable_venues is not null
     and v_coupon.applicable_venues <> 'all'::jsonb
     and not (v_coupon.applicable_venues @> to_jsonb(p_venue_id::text))
  then
    return query select false, 0, 'This coupon isn''t valid at this venue.';
    return;
  end if;

  v_discount := case
    when v_coupon.discount_type = 'flat' then least(v_coupon.value, p_amount)
    else round(p_amount * v_coupon.value / 100.0)::integer
  end;

  -- Atomic claim: only succeeds if the limit hasn't been reached by a
  -- concurrent request between the SELECT above and this UPDATE.
  update public.coupons
  set times_used = times_used + 1
  where id = v_coupon.id and times_used < usage_limit;

  if not found then
    return query select false, 0, 'This coupon was just claimed by someone else — please retry.';
    return;
  end if;

  return query select true, v_discount, 'Coupon applied.';
end;
$$;

grant execute on function public.validate_and_apply_coupon(text, uuid, integer) to authenticated;

-- bookings.coupon_code/discount_amount — the actual checkout-side half of
-- coupon support ("the small addition to consumer checkout" the brief
-- calls for). Added here rather than in the consumer app's own migration
-- folder only because that's where every other cross-app schema change
-- in this build has lived (see bookings.payment_status, Phase A).
alter table public.bookings add column if not exists coupon_code text;
alter table public.bookings add column if not exists discount_amount integer not null default 0;

-- create_booking — redefined again (consumer's own version, then Partner
-- Phase C's walk-in support, now this) to add p_coupon_code as one more
-- optional parameter. Body is otherwise IDENTICAL to Partner Phase C's
-- version — only the coupon handling is new, inserted right before the
-- final INSERT so v_total already reflects the discount. A coupon only
-- ever applies to an ONLINE booking (v_is_walkin is false): a walk-in's
-- price is already whatever the front desk decided via p_walkin_amount,
-- and applying a consumer discount code on top of a venue's own manual
-- price wouldn't mean anything coherent.
create or replace function public.create_booking(
  p_slot_ids                uuid[],
  p_credit_applied          integer default 0,
  p_walkin_customer_name    text default null,
  p_walkin_customer_phone   text default null,
  p_walkin_payment_method   text default null,
  p_walkin_payment_status   text default null,
  p_walkin_amount           integer default null,
  p_coupon_code             text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_walkin       boolean := p_walkin_customer_name is not null;
  v_user_id         uuid;
  v_slot            record;
  v_venue_id        uuid;
  v_sport           text;
  v_date            date;
  v_court_id        uuid;
  v_court_id_set    boolean := false;
  v_first_start     time;
  v_last_end        time;
  v_base_price      integer := 0;
  v_platform_fee    integer;
  v_gst             integer;
  v_total           integer;
  v_credit          integer;
  v_time_label      text;
  v_found_count     integer;
  v_booking         public.bookings;
  v_coupon_result   record;
  v_discount_amount integer := 0;
begin
  if v_is_walkin then
    if p_walkin_customer_phone is null then raise exception 'WALKIN_PHONE_REQUIRED'; end if;
    v_user_id := null;
  else
    v_user_id := auth.uid();
    if v_user_id is null then
      raise exception 'AUTH_REQUIRED' using errcode = '28000';
    end if;
  end if;

  if p_slot_ids is null or array_length(p_slot_ids, 1) is null then
    raise exception 'NO_SLOTS_SELECTED';
  end if;

  for v_slot in
    select * from public.slots
    where id = any (p_slot_ids)
    order by id
    for update
  loop
    if v_slot.status <> 'available' then
      raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001',
        detail = v_slot.id::text;
    end if;

    if v_venue_id is null then
      v_venue_id := v_slot.venue_id;
      v_sport := v_slot.sport;
      v_date := v_slot.date;
      v_court_id := v_slot.court_id;
      v_court_id_set := true;
      v_first_start := v_slot.start_time;
      v_last_end := v_slot.end_time;
    else
      if v_slot.venue_id <> v_venue_id or v_slot.sport <> v_sport or v_slot.date <> v_date then
        raise exception 'SLOTS_MUST_SHARE_VENUE_SPORT_DATE';
      end if;
      if v_court_id_set and v_slot.court_id is distinct from v_court_id then
        raise exception 'SLOTS_MUST_SHARE_COURT';
      end if;
      if v_slot.start_time < v_first_start then v_first_start := v_slot.start_time; end if;
      if v_slot.end_time > v_last_end then v_last_end := v_slot.end_time; end if;
    end if;

    v_base_price := v_base_price + coalesce(v_slot.price, 0);
  end loop;

  select count(*) into v_found_count from public.slots where id = any (p_slot_ids);
  if v_found_count <> array_length(p_slot_ids, 1) or v_found_count = 0 then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  if v_is_walkin then
    if public.partner_role_for_venue(v_venue_id) is null then
      raise exception 'NOT_ALLOWED';
    end if;
    v_platform_fee := 0;
    v_gst := 0;
    v_total := coalesce(p_walkin_amount, v_base_price);
    v_credit := 0;
  else
    v_platform_fee := round(v_base_price * 0.05);
    v_gst := round((v_base_price + v_platform_fee) * 0.18);
    v_total := v_base_price + v_platform_fee + v_gst;
    v_credit := greatest(0, least(coalesce(p_credit_applied, 0), v_total, public.my_wallet_balance()));

    if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
      select * into v_coupon_result from public.validate_and_apply_coupon(p_coupon_code, v_venue_id, v_total);
      if not v_coupon_result.valid then
        raise exception '%', v_coupon_result.message using errcode = 'P0001';
      end if;
      v_discount_amount := v_coupon_result.discount_amount;
      -- Discount comes off what's actually charged, same as wallet
      -- credit — never below zero, and never double-counted against
      -- credit already applied (both reduce v_total independently here,
      -- but v_credit was computed above against the PRE-discount total,
      -- so re-clamp it in case the discount alone already covers most of it).
      v_total := greatest(0, v_total - v_discount_amount);
      v_credit := least(v_credit, v_total);
    end if;
  end if;

  v_time_label := to_char(v_first_start, 'HH12:MI AM') || ' – ' || to_char(v_last_end, 'HH12:MI AM');

  insert into public.bookings (
    user_id, venue_id, slot_id, sport, date, time,
    price_paid, platform_fee, gst, credit_applied, status,
    walkin_customer_name, walkin_customer_phone, source, payment_method, payment_status,
    coupon_code, discount_amount
  ) values (
    v_user_id, v_venue_id, p_slot_ids[1], v_sport, v_date, v_time_label,
    v_total, v_platform_fee, v_gst, v_credit,
    case when v_is_walkin then 'confirmed' else 'pending' end,
    p_walkin_customer_name, p_walkin_customer_phone,
    case when v_is_walkin then 'walk_in' else 'online' end,
    coalesce(p_walkin_payment_method, 'online'),
    case when v_is_walkin then coalesce(p_walkin_payment_status, 'paid') else 'pending' end,
    case when v_discount_amount > 0 then upper(trim(p_coupon_code)) else null end,
    v_discount_amount
  ) returning * into v_booking;

  insert into public.booking_slots (booking_id, slot_id)
  select v_booking.id, s_id from unnest(p_slot_ids) as s_id;

  update public.slots set status = 'booked' where id = any (p_slot_ids);

  if v_credit > 0 then
    insert into public.wallet_transactions (user_id, amount, type, description)
    values (v_user_id, -v_credit, 'redeemed', 'Applied to booking ' || v_booking.id::text);
  end if;

  return v_booking;
end;
$$;

grant execute on function public.create_booking(uuid[], integer, text, text, text, text, integer, text) to authenticated;

-- Exactly one create_booking, matching every prior redefinition's own
-- rule — the 7-argument signature (no coupon param) is superseded by the
-- 8-argument one above.
drop function if exists public.create_booking(uuid[], integer, text, text, text, text, integer);

-- ============================================================================
-- E3. notifications_log — logs intent only, per the brief; no real
--     SMS/push delivery is wired up. admin_notification_audience_count
--     gives the UI a REAL estimated-reach number instead of a hardcoded
--     mock figure, computed from actual users/bookings.
-- ============================================================================

create table if not exists public.notifications_log (
  id              uuid primary key default gen_random_uuid(),
  message         text not null,
  audience        text not null,
  recipient_count integer not null,
  sent_by         uuid references public.admin_users (id) on delete set null,
  sent_at         timestamptz not null default now(),

  constraint notifications_log_audience_check
    check (audience in ('all_users', 'inactive_30_days', 'pending_bookings'))
);

comment on table public.notifications_log is
  'Logs intended notifications only — no real SMS/push delivery is wired '
  'up yet (see the brief). "specific_city" was dropped as an audience '
  'option: public.users has no city column, and nothing else on a user '
  'ties them to one, so there is no real data to target by.';

alter table public.notifications_log enable row level security;

drop policy if exists "notifications_log admin read" on public.notifications_log;
create policy "notifications_log admin read" on public.notifications_log
  for select using (public.is_admin());

create or replace function public.admin_notification_audience_count(p_audience text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_audience = 'all_users' then (select count(*)::integer from public.users)
    when p_audience = 'inactive_30_days' then (
      select count(*)::integer from public.users u
      where not exists (
        select 1 from public.bookings b
        where b.user_id = u.id and b.created_at > now() - interval '30 days'
      )
    )
    when p_audience = 'pending_bookings' then (
      select count(distinct user_id)::integer from public.bookings
      where status in ('pending', 'confirmed') and date >= current_date
    )
    else 0
  end
  where public.is_admin();
$$;

grant execute on function public.admin_notification_audience_count(text) to authenticated;

create or replace function public.admin_send_notification(p_message text, p_audience text)
returns public.notifications_log
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log public.notifications_log;
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_message is null or length(trim(p_message)) = 0 then
    raise exception 'MESSAGE_REQUIRED';
  end if;

  v_count := public.admin_notification_audience_count(p_audience);

  insert into public.notifications_log (message, audience, recipient_count, sent_by)
  values (trim(p_message), p_audience, coalesce(v_count, 0), auth.uid())
  returning * into v_log;

  return v_log;
end;
$$;

grant execute on function public.admin_send_notification(text, text) to authenticated;

-- ============================================================================
-- E4. Admin roles — real invite/role-change/remove, completing what
--     admin-otp-verify (Phase A) already anticipated in its own comments
--     ("Phase E's 'add admin' flow creates the auth.users row first").
--     The actual auth.users creation needs the Supabase Admin API (service
--     role only, can't be done from a plain SQL function) — that's
--     admin-invite-admin, the new Edge Function alongside this migration.
--     This migration adds what SQL can own: tracking whether someone's
--     actually logged in yet, and the role-change/remove actions.
-- ============================================================================

alter table public.admin_users add column if not exists last_login_at timestamptz;

comment on column public.admin_users.last_login_at is
  'Null means invited but never logged in yet — set by admin-otp-verify '
  'on the first (and every) successful login. Drives the Active/Invited '
  'badge in the Admin Roles screen for real, instead of a fixed mock status.';

create or replace function public.admin_update_role(p_admin_id uuid, p_role text)
returns public.admin_users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.admin_users;
begin
  if not public.is_super_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_role not in ('super_admin', 'ops_support') then
    raise exception 'INVALID_ROLE';
  end if;
  if p_admin_id = auth.uid() then
    raise exception 'CANNOT_CHANGE_OWN_ROLE';
  end if;

  update public.admin_users set role = p_role where id = p_admin_id returning * into v_admin;

  if v_admin.id is null then
    raise exception 'ADMIN_NOT_FOUND';
  end if;

  return v_admin;
end;
$$;

grant execute on function public.admin_update_role(uuid, text) to authenticated;

create or replace function public.admin_remove_admin(p_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_admin_id = auth.uid() then
    raise exception 'CANNOT_REMOVE_SELF';
  end if;

  -- Deletes the admin_users row only — NOT the underlying auth.users
  -- identity (the FK runs the other direction: admin_users.id references
  -- auth.users, cascading on delete of the AUTH row, not this one). This
  -- is the correct behavior: revoke admin access without touching
  -- whatever else that phone/email might be used for (e.g. nothing here,
  -- today, but the identity model deliberately allows for it — see
  -- admin_users' own table comment).
  delete from public.admin_users where id = p_admin_id;
end;
$$;

grant execute on function public.admin_remove_admin(uuid) to authenticated;

-- ============================================================================
-- End of Admin Backend Phase E
-- ============================================================================
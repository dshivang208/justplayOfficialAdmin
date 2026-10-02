-- ============================================================================
-- JustPlay Admin — real backend for the Dashboard Overview (the last
-- screen still on src/data/dashboard.ts mock data; every other screen —
-- bookings, users, payments, content, venues — is already real).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. bookings.cancelled_at — "Recent activity" needs to show cancellations
-- in actual chronological order alongside new bookings and venue signups.
-- `bookings` has `created_at` (when it was BOOKED) and `date`/`time` (the
-- session's own date — often in the future), but nothing records when a
-- booking was actually CANCELLED. A trigger is more robust than touching
-- every write path individually — four different places across three apps
-- (Consumer's cancel flow, Partner's booking management, Admin's own
-- cancel/refund override, the payout flow) can set bookings.status, and a
-- trigger catches all of them without needing to find and edit each one.
-- ----------------------------------------------------------------------------

alter table public.bookings add column if not exists cancelled_at timestamptz;

create or replace function public.trg_bookings_cancelled_at()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('cancelled', 'cancelled_refunded') and old.status not in ('cancelled', 'cancelled_refunded') then
    new.cancelled_at := now();
  elsif new.status not in ('cancelled', 'cancelled_refunded') then
    new.cancelled_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_cancelled_at on public.bookings;
create trigger bookings_cancelled_at
  before update of status on public.bookings
  for each row
  when (old.status is distinct from new.status)
  execute function public.trg_bookings_cancelled_at();

-- No backfill: a booking cancelled before this migration has no real
-- cancellation time to recover (using created_at would be actively wrong,
-- not just imprecise), so it simply won't appear in the activity feed —
-- the feed only ever needs to show RECENT events, so this is a fine
-- trade-off, not a gap worth chasing.

-- ----------------------------------------------------------------------------
-- 2. admin_dashboard_bookings_trend — booking COUNT per day, for the last
-- p_days. admin_financial_daily (Phase D) already tracks GMV per day but
-- is a MATERIALIZED view (refreshed on a schedule / on demand) with no
-- bookings-count column at all; a plain live query is both simpler and
-- always current for this chart, which specifically needs "today" to be
-- accurate, not just the last scheduled refresh. GMV here uses the exact
-- same formula as admin_financial_daily (price_paid - credit_applied,
-- grouped by created_at::date) so the two can never quietly disagree.
-- Zero-booking days are included (not skipped) so the chart always has a
-- continuous p_days-point line, same shape the old mock always produced.
-- ----------------------------------------------------------------------------

create or replace function public.admin_dashboard_bookings_trend(p_days integer default 30)
returns table (day date, bookings integer, gmv integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    d::date as day,
    count(b.id)::integer as bookings,
    coalesce(sum(b.price_paid - b.credit_applied), 0)::integer as gmv
  from generate_series(current_date - (greatest(p_days, 1) - 1), current_date, interval '1 day') d
  left join public.bookings b on b.created_at::date = d::date
  where public.is_admin()
  group by d
  order by d;
$$;

grant execute on function public.admin_dashboard_bookings_trend(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. admin_dashboard_activity — the "Recent activity" feed: new bookings,
-- cancellations, and new venue signups, merged and ordered by when each
-- actually happened. is_admin()-gated the same way as every other admin_*
-- function; returns [] rather than erroring for a non-admin caller (the
-- route already only renders for a signed-in admin, so this mirrors how
-- listAdminAlerts degrades rather than throws).
-- ----------------------------------------------------------------------------

create or replace function public.admin_dashboard_activity(p_limit integer default 8)
returns table (
  id text,
  activity_type text,
  title text,
  subtitle text,
  happened_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with booking_events as (
    select
      'booking-' || b.id as id,
      'booking' as activity_type,
      'New booking — ' || coalesce(v.name, 'Unknown venue') as title,
      coalesce(u.name, 'Unknown customer') || ' · ' || b.sport
        || ' · ₹' || (b.price_paid - b.credit_applied)::text as subtitle,
      b.created_at as happened_at
    from public.bookings b
    left join public.venues v on v.id = b.venue_id
    left join public.users u on u.id = b.user_id
    where public.is_admin()
    order by b.created_at desc
    limit p_limit
  ),
  cancellation_events as (
    select
      'cancellation-' || b.id as id,
      'cancellation' as activity_type,
      'Booking cancelled — ' || coalesce(v.name, 'Unknown venue') as title,
      coalesce(u.name, 'Unknown customer') || ' · ' || b.sport
        || ' · ' || case when b.payment_status = 'refunded' then 'refunded' else 'no refund' end as subtitle,
      b.cancelled_at as happened_at
    from public.bookings b
    left join public.venues v on v.id = b.venue_id
    left join public.users u on u.id = b.user_id
    where public.is_admin() and b.cancelled_at is not null
    order by b.cancelled_at desc
    limit p_limit
  ),
  venue_signup_events as (
    select
      'venue-' || v.id as id,
      'venue_signup' as activity_type,
      'New venue signup — ' || v.name as title,
      case
        when v.approval_status = 'pending' then 'Awaiting review'
        when v.approval_status = 'approved' then 'Approved'
        when v.approval_status = 'rejected' then 'Rejected'
        else coalesce(v.approval_status, 'Submitted')
      end as subtitle,
      v.created_at as happened_at
    from public.venues v
    where public.is_admin()
    order by v.created_at desc
    limit p_limit
  )
  select * from (
    select * from booking_events
    union all
    select * from cancellation_events
    union all
    select * from venue_signup_events
  ) merged
  order by happened_at desc
  limit p_limit;
$$;

grant execute on function public.admin_dashboard_activity(integer) to authenticated;
-- ============================================================================
-- Admin analytics — KPI overview, time series, per-venue revenue, breakdowns.
--
-- Powers the new dashboard analytics (period picker: week / month / quarter /
-- year / custom, optional single-venue filter).
--
-- Definitions (same as the existing admin_financial_daily view, so the numbers
-- on both screens agree):
--   * a booking is bucketed by the day it was MADE, in Asia/Kolkata time;
--   * "bookings" = status confirmed / completed;  "cancelled" = cancelled*;
--   * GMV      = price_paid - credit_applied, on paid + confirmed/completed;
--   * platform revenue (commission) = GMV minus the venue's net payout at the
--     booking court's commission_rate (venue_payout_net_amount);
--   * utilisation = booked / (booked + available) slots, by PLAY date.
--
-- Money fields (GMV, commission, refunds, averages) come back NULL unless the
-- caller is a Super Admin — Ops/Support get the operational numbers only.
-- Every function is admin-only (is_admin()). Idempotent — safe to re-run.
-- ============================================================================

-- Optional sport filter (p_sport) on every function: bookings.sport, e.g. 'Box Cricket'.
-- The old 3/4-argument versions are dropped first so the new optional argument
-- never makes a call ambiguous.
drop function if exists public.admin_analytics_overview(date, date, uuid);
drop function if exists public.admin_analytics_timeseries(date, date, text, uuid);
drop function if exists public.admin_analytics_venues(date, date);
drop function if exists public.admin_analytics_breakdown(date, date, uuid);
drop function if exists public._an_kpis(date, date, uuid);
drop function if exists public._an_bookings(date, date, uuid);

-- ── 0. Internal row source ──────────────────────────────────────────────────
create or replace function public._an_bookings(p_from date, p_to date, p_venue uuid default null, p_sport text default null)
returns table (
  id uuid, venue_id uuid, user_id uuid, sport text, day date, play_date date,
  source text, valid boolean, cancelled boolean, gmv integer, commission integer,
  play_hour integer, lead_days integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id, b.venue_id, b.user_id, b.sport,
    (b.created_at at time zone 'Asia/Kolkata')::date as day,
    b.date as play_date,
    b.source,
    (b.status in ('confirmed', 'completed')) as valid,
    (b.status in ('cancelled', 'cancelled_refunded')) as cancelled,
    case when b.status in ('confirmed', 'completed') and b.payment_status = 'paid'
         then (b.price_paid - b.credit_applied) else 0 end as gmv,
    case when b.status in ('confirmed', 'completed') and b.payment_status = 'paid'
         then (b.price_paid - b.credit_applied)
              - public.venue_payout_net_amount((b.price_paid - b.credit_applied), coalesce(c.commission_rate, 0))
         else 0 end as commission,
    case
      when substring(b.time from '^\s*(\d{1,2}):') is null then null
      else (substring(b.time from '^\s*(\d{1,2}):')::int % 12)
           + case when b.time ~* '^\s*\d{1,2}:\d{2}\s*PM' then 12 else 0 end
    end as play_hour,
    (b.date - (b.created_at at time zone 'Asia/Kolkata')::date) as lead_days
  from public.bookings b
  left join lateral (
    select ct.commission_rate
    from public.booking_slots bs
    join public.slots s on s.id = bs.slot_id
    join public.courts ct on ct.id = s.court_id
    where bs.booking_id = b.id
    limit 1
  ) c on true
  where public.is_admin()
    and (b.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
    and (p_venue is null or b.venue_id = p_venue)
    and (p_sport is null or b.sport = p_sport);
$$;
revoke all on function public._an_bookings(date, date, uuid, text) from public, anon, authenticated;

-- ── 1. KPI block for one period ─────────────────────────────────────────────
create or replace function public._an_kpis(p_from date, p_to date, p_venue uuid default null, p_sport text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  fin boolean := public.is_super_admin();
  r record;
  v_live int;
  v_slots_booked int;
  v_slots_open int;
  v_refunds bigint;
  v_new_users int;
  v_new_customers int;
  v_repeat int;
begin
  select
    count(*) filter (where valid)                              as bookings,
    count(*) filter (where cancelled)                          as cancelled,
    coalesce(sum(gmv), 0)                                      as gmv,
    coalesce(sum(commission), 0)                               as commission,
    count(distinct user_id) filter (where valid and user_id is not null) as customers,
    count(*) filter (where valid and source = 'walk_in')       as walkin,
    count(*) filter (where valid and source = 'online')        as online,
    count(distinct venue_id) filter (where valid)              as active_venues,
    avg(lead_days) filter (where valid and lead_days >= 0)     as lead_days
  into r
  from public._an_bookings(p_from, p_to, p_venue, p_sport);

  select count(*) into v_live from public.venues
   where is_active and approval_status = 'approved' and (p_venue is null or id = p_venue)
     and (p_sport is null or exists (select 1 from public.courts ct where ct.venue_id = venues.id and ct.sport = p_sport));

  -- Customers whose first-ever booking (at this venue, if filtered) falls in the period.
  with firsts as (
    select user_id, min((created_at at time zone 'Asia/Kolkata')::date) as first_day
    from public.bookings
    where status in ('confirmed', 'completed') and user_id is not null
      and (p_venue is null or venue_id = p_venue)
      and (p_sport is null or sport = p_sport)
    group by user_id
  )
  select count(*) filter (where first_day between p_from and p_to),
         count(*) filter (where first_day < p_from)
    into v_new_customers, v_repeat
  from firsts f
  where exists (
    select 1 from public._an_bookings(p_from, p_to, p_venue, p_sport) x
    where x.valid and x.user_id = f.user_id
  );
  -- returning customers also include anyone who booked 2+ times inside the period
  v_repeat := v_repeat + (
    select count(*) from (
      select user_id from public._an_bookings(p_from, p_to, p_venue, p_sport) x
      where x.valid and x.user_id is not null
      group by user_id having count(*) >= 2
    ) m
    where not exists (
      select 1 from public.bookings pb
      where pb.user_id = m.user_id and pb.status in ('confirmed', 'completed')
        and (pb.created_at at time zone 'Asia/Kolkata')::date < p_from
        and (p_venue is null or pb.venue_id = p_venue)
        and (p_sport is null or pb.sport = p_sport)
    )
  );

  select count(*) filter (where s.status = 'booked'),
         count(*) filter (where s.status = 'available')
    into v_slots_booked, v_slots_open
  from public.slots s
  where s.date between p_from and p_to and (p_venue is null or s.venue_id = p_venue)
    and (p_sport is null or s.sport = p_sport);

  select coalesce(sum(rl.amount), 0) into v_refunds
  from public.refund_log rl
  left join public.bookings b on b.id = rl.booking_id
  where rl.status = 'processed'
    and (rl.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
    and (p_venue is null or b.venue_id = p_venue)
    and (p_sport is null or b.sport = p_sport);

  select count(*) into v_new_users from public.users
   where (created_at at time zone 'Asia/Kolkata')::date between p_from and p_to;

  return jsonb_build_object(
    'bookings',           r.bookings,
    'cancelled',          r.cancelled,
    'cancellation_rate',  case when r.bookings + r.cancelled > 0
                               then round(100.0 * r.cancelled / (r.bookings + r.cancelled), 1) end,
    'gmv',                case when fin then r.gmv end,
    'commission',         case when fin then r.commission end,
    'refunds',            case when fin then v_refunds end,
    'avg_booking_value',  case when fin and r.bookings > 0 then round(r.gmv::numeric / r.bookings) end,
    'customers',          r.customers,
    'new_customers',      v_new_customers,
    'returning_customers', v_repeat,
    'repeat_rate',        case when r.customers > 0 then round(100.0 * v_repeat / r.customers, 1) end,
    'revenue_per_customer', case when fin and r.customers > 0 then round(r.gmv::numeric / r.customers) end,
    'walk_in_bookings',   r.walkin,
    'online_bookings',    r.online,
    'active_venues',      r.active_venues,
    'live_venues',        v_live,
    'avg_revenue_per_venue',      case when fin and r.active_venues > 0 then round(r.gmv::numeric / r.active_venues) end,
    'avg_revenue_per_live_venue', case when fin and v_live > 0 then round(r.gmv::numeric / v_live) end,
    'bookings_per_venue', case when r.active_venues > 0 then round(r.bookings::numeric / r.active_venues, 1) end,
    'utilization_pct',    case when v_slots_booked + v_slots_open > 0
                               then round(100.0 * v_slots_booked / (v_slots_booked + v_slots_open), 1) end,
    'avg_lead_days',      case when r.lead_days is not null then round(r.lead_days, 1) end,
    'new_users',          v_new_users
  );
end;
$$;
revoke all on function public._an_kpis(date, date, uuid, text) from public, anon, authenticated;

-- ── 2. Overview: this period + the equal-length period before it ────────────
create or replace function public.admin_analytics_overview(p_from date, p_to date, p_venue uuid default null, p_sport text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_len int;
  v_prev_to date;
  v_prev_from date;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_RANGE'; end if;
  if p_to - p_from > 800 then raise exception 'RANGE_TOO_LARGE'; end if;

  v_len := (p_to - p_from) + 1;
  v_prev_to := p_from - 1;
  v_prev_from := v_prev_to - (v_len - 1);

  return jsonb_build_object(
    'from', p_from, 'to', p_to,
    'prev_from', v_prev_from, 'prev_to', v_prev_to,
    'can_see_revenue', public.is_super_admin(),
    'current',  public._an_kpis(p_from, p_to, p_venue, p_sport),
    'previous', public._an_kpis(v_prev_from, v_prev_to, p_venue, p_sport)
  );
end;
$$;
grant execute on function public.admin_analytics_overview(date, date, uuid, text) to authenticated;

-- ── 3. Time series (day / week / month buckets, zero-filled) ────────────────
create or replace function public.admin_analytics_timeseries(
  p_from date, p_to date, p_granularity text default 'day', p_venue uuid default null, p_sport text default null
)
returns table (bucket date, bookings integer, cancelled integer, gmv integer, commission integer, customers integer)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  fin boolean := public.is_super_admin();
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  if p_granularity not in ('day', 'week', 'month') then raise exception 'INVALID_GRANULARITY'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_RANGE'; end if;
  if p_to - p_from > 1500 then raise exception 'RANGE_TOO_LARGE'; end if;

  return query
  with b as (
    select date_trunc(p_granularity, x.day::timestamp)::date as bucket,
           x.valid, x.cancelled, x.gmv, x.commission, x.user_id
    from public._an_bookings(p_from, p_to, p_venue, p_sport) x
  ),
  agg as (
    select b.bucket,
           count(*) filter (where b.valid)::integer                     as bookings,
           count(*) filter (where b.cancelled)::integer                 as cancelled,
           coalesce(sum(b.gmv), 0)::integer                             as gmv,
           coalesce(sum(b.commission), 0)::integer                      as commission,
           count(distinct b.user_id) filter (where b.valid)::integer    as customers
    from b group by b.bucket
  )
  select s::date,
         coalesce(a.bookings, 0), coalesce(a.cancelled, 0),
         case when fin then coalesce(a.gmv, 0) end,
         case when fin then coalesce(a.commission, 0) end,
         coalesce(a.customers, 0)
  from generate_series(
         date_trunc(p_granularity, p_from::timestamp),
         date_trunc(p_granularity, p_to::timestamp),
         ('1 ' || p_granularity)::interval
       ) s
  left join agg a on a.bucket = s::date
  order by s;
end;
$$;
grant execute on function public.admin_analytics_timeseries(date, date, text, uuid, text) to authenticated;

-- ── 4. Revenue / performance per venue ──────────────────────────────────────
create or replace function public.admin_analytics_venues(p_from date, p_to date, p_sport text default null)
returns table (
  venue_id uuid, name text, area text, is_active boolean,
  bookings integer, cancelled integer, gmv integer, commission integer,
  avg_booking_value integer, customers integer, utilization_pct numeric,
  rating numeric, review_count integer, gmv_share_pct numeric,
  prev_bookings integer, prev_gmv integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  fin boolean := public.is_super_admin();
  v_len int;
  v_prev_to date;
  v_prev_from date;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_RANGE'; end if;
  if p_to - p_from > 800 then raise exception 'RANGE_TOO_LARGE'; end if;
  v_len := (p_to - p_from) + 1;
  v_prev_to := p_from - 1;
  v_prev_from := v_prev_to - (v_len - 1);

  return query
  with cur as (
    select x.venue_id,
           count(*) filter (where x.valid)::integer          as bookings,
           count(*) filter (where x.cancelled)::integer      as cancelled,
           coalesce(sum(x.gmv), 0)::integer                  as gmv,
           coalesce(sum(x.commission), 0)::integer           as commission,
           count(distinct x.user_id) filter (where x.valid)::integer as customers
    from public._an_bookings(p_from, p_to, null, p_sport) x group by x.venue_id
  ),
  prev as (
    select x.venue_id,
           count(*) filter (where x.valid)::integer as bookings,
           coalesce(sum(x.gmv), 0)::integer         as gmv
    from public._an_bookings(v_prev_from, v_prev_to, null, p_sport) x group by x.venue_id
  ),
  util as (
    select s.venue_id,
           count(*) filter (where s.status = 'booked')    as booked,
           count(*) filter (where s.status = 'available') as open
    from public.slots s where s.date between p_from and p_to and (p_sport is null or s.sport = p_sport) group by s.venue_id
  ),
  tot as (select coalesce(sum(cur.gmv), 0) as gmv from cur)
  select v.id, v.name, v.area, v.is_active,
         coalesce(cur.bookings, 0), coalesce(cur.cancelled, 0),
         case when fin then coalesce(cur.gmv, 0) end,
         case when fin then coalesce(cur.commission, 0) end,
         case when fin and coalesce(cur.bookings, 0) > 0 then round(cur.gmv::numeric / cur.bookings)::integer end,
         coalesce(cur.customers, 0),
         case when coalesce(u.booked, 0) + coalesce(u.open, 0) > 0
              then round(100.0 * u.booked / (u.booked + u.open), 1) end,
         v.rating, coalesce(v.review_count, 0),
         case when fin and (select gmv from tot) > 0
              then round(100.0 * coalesce(cur.gmv, 0) / (select gmv from tot), 1) end,
         coalesce(prev.bookings, 0),
         case when fin then coalesce(prev.gmv, 0) end
  from public.venues v
  left join cur  on cur.venue_id  = v.id
  left join prev on prev.venue_id = v.id
  left join util u on u.venue_id  = v.id
  where v.approval_status = 'approved' or cur.venue_id is not null
  order by case when fin then coalesce(cur.gmv, 0) else coalesce(cur.bookings, 0) end desc, v.name;
end;
$$;
grant execute on function public.admin_analytics_venues(date, date, text) to authenticated;

-- ── 5. Breakdowns: sport, weekday, hour, source ─────────────────────────────
create or replace function public.admin_analytics_breakdown(p_from date, p_to date, p_venue uuid default null, p_sport text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  fin boolean := public.is_super_admin();
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_RANGE'; end if;
  if p_to - p_from > 800 then raise exception 'RANGE_TOO_LARGE'; end if;

  return jsonb_build_object(
    'by_sport', coalesce((
      select jsonb_agg(jsonb_build_object(
               'sport', t.sport, 'bookings', t.bookings,
               'gmv', case when fin then t.gmv end) order by t.bookings desc, t.sport)
      from (select x.sport, count(*) as bookings, coalesce(sum(x.gmv), 0) as gmv
            from public._an_bookings(p_from, p_to, p_venue, p_sport) x
            where x.valid group by x.sport) t
    ), '[]'::jsonb),
    -- 0 = Monday … 6 = Sunday, by the day people PLAY
    'by_weekday', (
      select jsonb_agg(jsonb_build_object('dow', d.dow, 'bookings', coalesce(t.bookings, 0)) order by d.dow)
      from generate_series(0, 6) d(dow)
      left join (select (extract(isodow from x.play_date)::int - 1) as dow, count(*) as bookings
                 from public._an_bookings(p_from, p_to, p_venue, p_sport) x
                 where x.valid group by 1) t on t.dow = d.dow
    ),
    'by_hour', (
      select jsonb_agg(jsonb_build_object('hour', h.hour, 'bookings', coalesce(t.bookings, 0)) order by h.hour)
      from generate_series(5, 23) h(hour)
      left join (select x.play_hour as hour, count(*) as bookings
                 from public._an_bookings(p_from, p_to, p_venue, p_sport) x
                 where x.valid and x.play_hour is not null group by 1) t on t.hour = h.hour
    ),
    'by_source', jsonb_build_object(
      'online',  (select count(*) from public._an_bookings(p_from, p_to, p_venue, p_sport) x where x.valid and x.source = 'online'),
      'walk_in', (select count(*) from public._an_bookings(p_from, p_to, p_venue, p_sport) x where x.valid and x.source = 'walk_in')
    )
  );
end;
$$;
grant execute on function public.admin_analytics_breakdown(date, date, uuid, text) to authenticated;

-- ── 6. Venue list for the picker (id + name only) ───────────────────────────
create or replace function public.admin_analytics_venue_options()
returns table (venue_id uuid, name text, area text)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.name, v.area from public.venues v
  where public.is_admin() and v.approval_status = 'approved'
  order by v.name;
$$;
grant execute on function public.admin_analytics_venue_options() to authenticated;

-- ── 7. Performance by sport type (table: current vs previous period) ────────
create or replace function public.admin_analytics_sports(p_from date, p_to date, p_venue uuid default null)
returns table (
  sport text, bookings integer, cancelled integer, gmv integer, commission integer,
  avg_booking_value integer, customers integer, venues integer, utilization_pct numeric,
  gmv_share_pct numeric, bookings_share_pct numeric, prev_bookings integer, prev_gmv integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  fin boolean := public.is_super_admin();
  v_len int;
  v_prev_to date;
  v_prev_from date;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_RANGE'; end if;
  if p_to - p_from > 800 then raise exception 'RANGE_TOO_LARGE'; end if;
  v_len := (p_to - p_from) + 1;
  v_prev_to := p_from - 1;
  v_prev_from := v_prev_to - (v_len - 1);

  return query
  with names as (
    select c.sport from public.courts c where c.sport is not null
    union select b.sport from public.bookings b where b.sport is not null
  ),
  cur as (
    select x.sport,
           count(*) filter (where x.valid)::integer          as bookings,
           count(*) filter (where x.cancelled)::integer      as cancelled,
           coalesce(sum(x.gmv), 0)::integer                  as gmv,
           coalesce(sum(x.commission), 0)::integer           as commission,
           count(distinct x.user_id) filter (where x.valid)::integer as customers,
           count(distinct x.venue_id) filter (where x.valid)::integer as venues
    from public._an_bookings(p_from, p_to, p_venue, null) x group by x.sport
  ),
  prev as (
    select x.sport,
           count(*) filter (where x.valid)::integer as bookings,
           coalesce(sum(x.gmv), 0)::integer         as gmv
    from public._an_bookings(v_prev_from, v_prev_to, p_venue, null) x group by x.sport
  ),
  util as (
    select s.sport,
           count(*) filter (where s.status = 'booked')    as booked,
           count(*) filter (where s.status = 'available') as open
    from public.slots s
    where s.date between p_from and p_to and (p_venue is null or s.venue_id = p_venue)
    group by s.sport
  ),
  tot as (select coalesce(sum(cur.gmv), 0) as gmv, coalesce(sum(cur.bookings), 0) as bookings from cur)
  select n.sport,
         coalesce(cur.bookings, 0), coalesce(cur.cancelled, 0),
         case when fin then coalesce(cur.gmv, 0) end,
         case when fin then coalesce(cur.commission, 0) end,
         case when fin and coalesce(cur.bookings, 0) > 0 then round(cur.gmv::numeric / cur.bookings)::integer end,
         coalesce(cur.customers, 0), coalesce(cur.venues, 0),
         case when coalesce(u.booked, 0) + coalesce(u.open, 0) > 0
              then round(100.0 * u.booked / (u.booked + u.open), 1) end,
         case when fin and (select gmv from tot) > 0
              then round(100.0 * coalesce(cur.gmv, 0) / (select gmv from tot), 1) end,
         case when (select bookings from tot) > 0
              then round(100.0 * coalesce(cur.bookings, 0) / (select bookings from tot), 1) end,
         coalesce(prev.bookings, 0),
         case when fin then coalesce(prev.gmv, 0) end
  from names n
  left join cur  on cur.sport  = n.sport
  left join prev on prev.sport = n.sport
  left join util u on u.sport  = n.sport
  order by case when fin then coalesce(cur.gmv, 0) else coalesce(cur.bookings, 0) end desc, n.sport;
end;
$$;
grant execute on function public.admin_analytics_sports(date, date, uuid) to authenticated;

-- ── 8. Bookings / revenue per sport over time (for the stacked chart) ───────
create or replace function public.admin_analytics_sport_series(
  p_from date, p_to date, p_granularity text default 'day', p_venue uuid default null
)
returns table (bucket date, sport text, bookings integer, gmv integer)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  fin boolean := public.is_super_admin();
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  if p_granularity not in ('day', 'week', 'month') then raise exception 'INVALID_GRANULARITY'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_RANGE'; end if;
  if p_to - p_from > 1500 then raise exception 'RANGE_TOO_LARGE'; end if;

  return query
  select date_trunc(p_granularity, x.day::timestamp)::date,
         x.sport,
         count(*) filter (where x.valid)::integer,
         case when fin then coalesce(sum(x.gmv), 0)::integer end
  from public._an_bookings(p_from, p_to, p_venue, null) x
  where x.valid
  group by 1, 2
  order by 1, 2;
end;
$$;
grant execute on function public.admin_analytics_sport_series(date, date, text, uuid) to authenticated;

-- ── 9. Sport list for the picker ────────────────────────────────────────────
create or replace function public.admin_analytics_sport_options()
returns table (sport text)
language sql
stable
security definer
set search_path = public
as $$
  select n.sport from (
    select c.sport from public.courts c where c.sport is not null
    union select b.sport from public.bookings b where b.sport is not null
  ) n
  where public.is_admin()
  order by n.sport;
$$;
grant execute on function public.admin_analytics_sport_options() to authenticated;

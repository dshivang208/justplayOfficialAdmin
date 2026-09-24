-- ============================================================================
-- JustPlay Admin — Backend Phase D: Payments/Payout Oversight
-- ============================================================================
-- Run after Phases A-C, and after the partner app's Phase D (payouts).
-- Everything here is super_admin-only where money moves, matching Phase A's
-- existing payments-section carve-out (ops_support is already blocked from
-- payouts/payout_line_items/payout_deductions by RLS, not just UI hiding —
-- this migration extends the same posture to the new tables below).
-- ============================================================================

-- ============================================================================
-- D1. payment_events — Phase D (consumer) left this with NO policies at
--     all ("service role only, not part of anything admin should read").
--     The transaction log needs it now, to tell a genuinely failed
--     payment attempt apart from one that's simply still pending — that
--     distinction doesn't exist anywhere on `bookings` itself.
-- ============================================================================

drop policy if exists "payment_events admin read" on public.payment_events;
create policy "payment_events admin read" on public.payment_events
  for select using (public.is_admin());

-- ============================================================================
-- D2. reconciliation_flags — one row per booking whose Razorpay payment
--     doesn't match our internal record. Populated by the
--     run-payment-reconciliation Edge Function (scheduled + manually
--     triggerable), never by a client directly.
-- ============================================================================

create table if not exists public.reconciliation_flags (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references public.bookings (id) on delete cascade,
  razorpay_payment_id text not null,
  expected_amount   integer not null,  -- what our own records say (price_paid - credit_applied), rupees
  settled_amount    integer,           -- what Razorpay's Fetch Payment API reports, rupees (null if it couldn't be fetched)
  razorpay_status   text,              -- Razorpay's own payment status at the time of the check
  mismatch_type     text not null,     -- 'amount_mismatch' | 'status_mismatch' | 'not_found'
  status            text not null default 'open',
  note              text,
  detected_at       timestamptz not null default now(),
  resolved_by       uuid references public.admin_users (id) on delete set null,
  resolved_at       timestamptz,

  constraint reconciliation_flags_mismatch_type_check
    check (mismatch_type in ('amount_mismatch', 'status_mismatch', 'not_found')),
  constraint reconciliation_flags_status_check
    check (status in ('open', 'resolved')),
  constraint reconciliation_flags_booking_unique unique (booking_id)
);

comment on table public.reconciliation_flags is
  'One open row per booking whose Razorpay payment record disagrees with '
  'ours. Unique on booking_id so a re-run of the reconciliation job updates '
  'the existing row (or auto-resolves it, resolved_by left null) rather '
  'than piling up duplicate flags for the same booking.';

alter table public.reconciliation_flags enable row level security;

drop policy if exists "reconciliation_flags super admin read" on public.reconciliation_flags;
create policy "reconciliation_flags super admin read" on public.reconciliation_flags
  for select using (public.is_super_admin());

create or replace function public.admin_resolve_reconciliation_flag(p_flag_id uuid, p_note text default null)
returns public.reconciliation_flags
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flag public.reconciliation_flags;
begin
  if not public.is_super_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  update public.reconciliation_flags
  set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(), note = coalesce(p_note, note)
  where id = p_flag_id
  returning * into v_flag;

  if v_flag.id is null then
    raise exception 'FLAG_NOT_FOUND';
  end if;

  return v_flag;
end;
$$;

grant execute on function public.admin_resolve_reconciliation_flag(uuid, text) to authenticated;

-- Written only by run-payment-reconciliation, which runs as service role —
-- no client grant needed, but a narrow upsert helper keeps the "unique per
-- booking, auto-resolve on a later match" logic in one place rather than
-- duplicated in the Edge Function's own SQL calls.
create or replace function public.record_reconciliation_check(
  p_booking_id       uuid,
  p_payment_id       text,
  p_expected_amount  integer,
  p_settled_amount   integer,
  p_razorpay_status  text,
  p_mismatch_type    text  -- null/'' means "no mismatch found this run"
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_mismatch_type is null or p_mismatch_type = '' then
    -- Matches now — if an earlier run had flagged this booking, auto-close
    -- it (resolved_by stays null: nobody reviewed it, it just stopped
    -- being wrong, e.g. a late webhook finally arrived).
    update public.reconciliation_flags
    set status = 'resolved', resolved_at = now(), note = coalesce(note, 'Auto-resolved: matched on a later reconciliation run.')
    where booking_id = p_booking_id and status = 'open';
    return;
  end if;

  insert into public.reconciliation_flags (
    booking_id, razorpay_payment_id, expected_amount, settled_amount, razorpay_status, mismatch_type, status
  ) values (
    p_booking_id, p_payment_id, p_expected_amount, p_settled_amount, p_razorpay_status, p_mismatch_type, 'open'
  )
  on conflict (booking_id) do update set
    razorpay_payment_id = excluded.razorpay_payment_id,
    expected_amount     = excluded.expected_amount,
    settled_amount       = excluded.settled_amount,
    razorpay_status      = excluded.razorpay_status,
    mismatch_type         = excluded.mismatch_type,
    status                = 'open',
    detected_at           = now(),
    resolved_by           = null,
    resolved_at           = null
  where public.reconciliation_flags.status = 'resolved'; -- don't clobber an already-open flag's investigation notes
end;
$$;

revoke all on function public.record_reconciliation_check(uuid, text, integer, integer, text, text)
  from public, authenticated, anon;
grant execute on function public.record_reconciliation_check(uuid, text, integer, integer, text, text)
  to service_role;

-- ============================================================================
-- D3. refund_requests — a real, reviewable queue. IMPORTANT scope note:
--     there is no consumer- or partner-facing flow ANYWHERE in this
--     platform yet that creates one of these rows — refunds today happen
--     either instantly (self-service, inside the free-cancellation
--     window) or via the admin's own direct override (Backend Phase C).
--     This table and admin_create_refund_request exist so support can log
--     a request that needs a second look (e.g. phoned-in, or a
--     policy-borderline case worth a deliberate decision trail) — it will
--     legitimately show zero rows until some real flow submits to it,
--     which is the honest state, not a bug.
-- ============================================================================

create table if not exists public.refund_requests (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.bookings (id) on delete cascade,
  amount         integer not null,
  reason         text not null,
  requested_by   text not null,  -- free text for now (e.g. "Support — phone"): no submitter identity system exists yet
  status         text not null default 'pending',
  reviewed_by    uuid references public.admin_users (id) on delete set null,
  review_note    text,
  requested_at   timestamptz not null default now(),
  reviewed_at    timestamptz,

  constraint refund_requests_status_check check (status in ('pending', 'approved', 'rejected')),
  constraint refund_requests_amount_positive check (amount > 0)
);

alter table public.refund_requests enable row level security;

drop policy if exists "refund_requests super admin read" on public.refund_requests;
create policy "refund_requests super admin read" on public.refund_requests
  for select using (public.is_super_admin());

create or replace function public.admin_create_refund_request(
  p_booking_id   uuid,
  p_amount       integer,
  p_reason       text,
  p_requested_by text
)
returns public.refund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.refund_requests;
begin
  if not public.is_super_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_amount <= 0 then
    raise exception 'AMOUNT_MUST_BE_POSITIVE';
  end if;

  insert into public.refund_requests (booking_id, amount, reason, requested_by)
  values (p_booking_id, p_amount, p_reason, p_requested_by)
  returning * into v_request;

  return v_request;
end;
$$;

grant execute on function public.admin_create_refund_request(uuid, integer, text, text) to authenticated;

-- Marks the review decision only — approval does NOT call Razorpay itself
-- (this function has no business talking to an external API). The
-- frontend calls this, and on 'approved', separately calls the same
-- cancel-booking-refund Edge Function every other refund in the platform
-- goes through (with admin_override) — see admin-data/refunds.ts. That
-- keeps "approval triggers the shared refund Edge Function" literal: one
-- function, one code path, this is just the paper trail around it.
create or replace function public.admin_review_refund_request(
  p_request_id uuid,
  p_status     text,
  p_note       text default null
)
returns public.refund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.refund_requests;
begin
  if not public.is_super_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'INVALID_STATUS';
  end if;

  update public.refund_requests
  set status = p_status, reviewed_by = auth.uid(), review_note = p_note, reviewed_at = now()
  where id = p_request_id and status = 'pending'
  returning * into v_request;

  if v_request.id is null then
    raise exception 'REQUEST_NOT_FOUND_OR_ALREADY_REVIEWED';
  end if;

  return v_request;
end;
$$;

grant execute on function public.admin_review_refund_request(uuid, text, text) to authenticated;

-- ============================================================================
-- D4. admin_pending_payouts — platform-wide equivalent of the partner
--     app's partner_pending_payout_line_items (Phase D there), which is
--     owner-scoped and can't be reused directly by an admin session. Same
--     underlying math (venue_payout_net_amount, same court-commission
--     lookup), just aggregated per venue across every venue at once
--     instead of gated to one owner's own venue.
-- ============================================================================

create or replace function public.admin_pending_payouts()
returns table (
  venue_id           uuid,
  venue_name         text,
  pending_net        integer,
  pending_deductions integer,
  payout_method      text,
  verification_status text
)
language sql
stable
security definer
set search_path = public
as $$
  with pending_earnings as (
    select
      b.venue_id,
      sum(public.venue_payout_net_amount(b.price_paid - b.credit_applied, coalesce(c.commission_rate, 0))) as net
    from public.bookings b
    left join lateral (
      select s.court_id
      from public.booking_slots bs
      join public.slots s on s.id = bs.slot_id
      where bs.booking_id = b.id and s.court_id is not null
      limit 1
    ) bc on true
    left join public.courts c on c.id = bc.court_id
    where b.status in ('confirmed', 'completed')
      and b.payment_status = 'paid'
      and not exists (select 1 from public.payout_line_items pli where pli.booking_id = b.id)
    group by b.venue_id
  ),
  pending_deducts as (
    select venue_id, sum(amount) as total
    from public.payout_deductions
    where applied_to_payout_id is null
    group by venue_id
  )
  select
    v.id,
    v.name,
    coalesce(pe.net, 0) - coalesce(pd.total, 0),
    coalesce(pd.total, 0),
    pa.method,
    pa.verification_status
  from public.venues v
  left join pending_earnings pe on pe.venue_id = v.id
  left join pending_deducts pd on pd.venue_id = v.id
  left join public.payout_accounts pa on pa.venue_id = v.id
  where public.is_admin()
    and (pe.net is not null or pd.total is not null)
  order by (coalesce(pe.net, 0) - coalesce(pd.total, 0)) desc;
$$;

grant execute on function public.admin_pending_payouts() to authenticated;

-- ============================================================================
-- D5. Financial summary — a materialized view refreshed on a schedule
--     (or manually, via admin_refresh_financial_summary), not recomputed
--     from a full table scan on every dashboard load. GMV/commission are
--     attributed to the day the BOOKING WAS MADE (created_at), since
--     that's when the platform's revenue is actually earned — a booking
--     made today for a session next week is today's GMV, not next
--     week's. Payouts/refunds/credits are attributed to when THEY
--     happened (payout_date / refund_log.created_at /
--     wallet_transactions.created_at), which is naturally a different day.
-- ============================================================================

create materialized view if not exists public.admin_financial_daily as
with gmv_by_day as (
  select
    b.created_at::date as day,
    sum(b.price_paid - b.credit_applied) as gmv,
    sum(
      (b.price_paid - b.credit_applied)
      - public.venue_payout_net_amount(b.price_paid - b.credit_applied, coalesce(c.commission_rate, 0))
    ) as commission
  from public.bookings b
  left join lateral (
    select s.court_id
    from public.booking_slots bs
    join public.slots s on s.id = bs.slot_id
    where bs.booking_id = b.id and s.court_id is not null
    limit 1
  ) bc on true
  left join public.courts c on c.id = bc.court_id
  where b.payment_status = 'paid'
  group by b.created_at::date
),
payouts_by_day as (
  select payout_date as day, sum(amount) as payouts_made
  from public.payouts
  where status in ('processing', 'completed')
  group by payout_date
),
refunds_by_day as (
  select created_at::date as day, sum(amount) as refunds
  from public.refund_log
  where status = 'processed'
  group by created_at::date
),
credits_by_day as (
  select created_at::date as day, sum(amount) as credits
  from public.wallet_transactions
  where type = 'goodwill_credit'
  group by created_at::date
)
select
  coalesce(g.day, p.day, r.day, c.day) as day,
  coalesce(g.gmv, 0) as gmv,
  coalesce(g.commission, 0) as commission,
  coalesce(p.payouts_made, 0) as payouts_made,
  coalesce(r.refunds, 0) as refunds,
  coalesce(c.credits, 0) as credits
from gmv_by_day g
full outer join payouts_by_day p on p.day = g.day
full outer join refunds_by_day r on r.day = coalesce(g.day, p.day)
full outer join credits_by_day c on c.day = coalesce(g.day, p.day, r.day);

create unique index if not exists idx_admin_financial_daily_day on public.admin_financial_daily (day);

-- Materialized views don't support RLS — access is entirely through the
-- SECURITY DEFINER function below, which enforces is_admin() itself.
revoke all on public.admin_financial_daily from public, authenticated, anon;

create or replace function public.admin_refresh_financial_summary()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  refresh materialized view concurrently public.admin_financial_daily;
end;
$$;

grant execute on function public.admin_refresh_financial_summary() to authenticated;

create or replace function public.admin_financial_summary(p_days integer)
returns table (day date, gmv integer, commission integer, payouts_made integer, refunds integer, credits integer)
language sql
stable
security definer
set search_path = public
as $$
  select day, gmv, commission, payouts_made, refunds, credits
  from public.admin_financial_daily
  where public.is_admin() and day >= current_date - (p_days - 1)
  order by day asc;
$$;

grant execute on function public.admin_financial_summary(integer) to authenticated;

-- ============================================================================
-- End of Admin Backend Phase D
-- ============================================================================
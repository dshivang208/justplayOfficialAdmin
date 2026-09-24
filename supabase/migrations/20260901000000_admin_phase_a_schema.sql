-- ============================================================================
-- JustPlay Admin — Backend Phase A: Schema + Auth + RLS
-- ============================================================================
-- Run this on the SAME Supabase project as the consumer and partner apps,
-- AFTER their migrations (this one references `public.venues`,
-- `public.users`, `public.bookings`, etc. and expects them to already
-- exist). Safe to re-run: every statement is idempotent.
--
-- ----------------------------------------------------------------------------
-- Schema verification note (updated after the fact)
-- ----------------------------------------------------------------------------
-- This file originally guessed at the shape of six partner-app tables
-- (partners, partner_venues, payouts, payout_line_items,
-- payout_deductions, payout_accounts) without having seen their real
-- migration, guarding every touch with `if to_regclass(...) is not null`
-- so a wrong guess would no-op rather than fail. Those guesses have since
-- been checked against the real partner-app migrations and were correct
-- in shape (table names, and the columns these policies reference) —
-- the guards below are kept anyway as normal defensive practice for a
-- migration that depends on another app's tables already existing, not
-- because the shape is still in doubt. The one real mismatch found was
-- bookings.payment_status's allowed values (fixed at the point it's
-- defined below, see the note there) and a since-corrected partner
-- auto-approval backfill in the Phase B migration — everything else
-- checked out.
--
-- Two columns are added to EXISTING tables because the admin RLS below has
-- nothing to gate on without them — both are called out with [ADD] again
-- at the point they're created:
--   • public.users.status              (for suspend/reactivate, Phase C)
--   • public.bookings.payment_status   (for refund tracking, Phase D)
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. ADMIN_USERS
-- ============================================================================
-- One row per admin team member. `id` is the same id as auth.users(id) —
-- exactly like the consumer app's `public.users`, but this is a SEPARATE
-- table and a separate identity: an admin's auth.users row is never the
-- same row as a consumer's or a partner staff member's. Rows here are
-- never created by client signup — only by a service-role Edge Function
-- (Phase E: "Add admin"), since admin accounts are manually provisioned.

create table if not exists public.admin_users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text unique,                                    -- [SPEC] email/phone
  phone       text unique,                                    -- [SPEC] email/phone
  name        text not null default '',                       -- [SPEC]
  role        text not null default 'ops_support',            -- [SPEC]
  created_at  timestamptz not null default now(),              -- [SPEC]

  constraint admin_users_role_check check (role in ('super_admin', 'ops_support')),
  constraint admin_users_contact_check check (email is not null or phone is not null)
);

comment on table public.admin_users is
  'Internal admin team members. Distinct identity space from public.users '
  '(consumers) and any partner-staff table — same auth.users pool, separate '
  'app-profile table, so one phone/email could theoretically hold accounts '
  'in more than one app without collision.';

-- ============================================================================
-- 2. ADMIN_AUDIT_LOG
-- ============================================================================
-- Every privileged admin action, across every phase. Rows are written by
-- Edge Functions (service role) or by the trigger below for direct RLS
-- writes — NEVER inserted by a client policy, so a compromised admin
-- session can't erase or falsify its own trail.

create table if not exists public.admin_audit_log (
  id            uuid primary key default gen_random_uuid(),
  admin_id      uuid references public.admin_users (id) on delete set null, -- [SPEC]
  action        text not null,                                 -- [SPEC] e.g. 'venue.approve'
  target_table  text not null,                                 -- [SPEC]
  target_id     text not null,                                 -- [SPEC] text: targets aren't all uuid
  details       jsonb not null default '{}'::jsonb,             -- [SPEC]
  created_at    timestamptz not null default now()              -- [SPEC] ("timestamp" in the brief)
);

comment on table public.admin_audit_log is
  'Append-only. Every manual override (refund, venue approval, ban, payout '
  'action, etc.) lands here — either via an Edge Function inserting '
  'directly with the service role, or via the log_admin_write() trigger '
  'below for plain RLS-permitted writes on bookings/users/wallet_transactions.';

create index if not exists idx_admin_audit_log_admin_id on public.admin_audit_log (admin_id);
create index if not exists idx_admin_audit_log_target on public.admin_audit_log (target_table, target_id);
create index if not exists idx_admin_audit_log_created_at on public.admin_audit_log (created_at desc);

-- ============================================================================
-- 3. VENUE COMMISSION (separate from `venues`, on purpose)
-- ============================================================================
-- The consumer schema's `venues` table has no commission column, and that
-- turns out to matter: RLS is row-level, not column-level, so there is no
-- clean way to let ops_support read a venue's name/address/sports but NOT
-- its commission rate if that rate lived as a column on `venues` itself.
-- Keeping it in its own super-admin-only table sidesteps the problem
-- entirely instead of fighting Postgres for column-level security.

create table if not exists public.venue_commission (
  venue_id         uuid primary key references public.venues (id) on delete cascade,
  commission_rate  numeric(5, 2) not null default 12.00,        -- [SPEC] percent
  updated_by       uuid references public.admin_users (id) on delete set null,
  updated_at       timestamptz not null default now(),

  constraint venue_commission_rate_range check (commission_rate >= 0 and commission_rate <= 100)
);

create table if not exists public.venue_commission_history (
  id             uuid primary key default gen_random_uuid(),
  venue_id       uuid not null references public.venues (id) on delete cascade,
  previous_rate  numeric(5, 2) not null,                        -- [SPEC]
  new_rate       numeric(5, 2) not null,                        -- [SPEC]
  changed_by     uuid references public.admin_users (id) on delete set null, -- [SPEC]
  note           text,
  created_at     timestamptz not null default now()             -- [SPEC]
);

create index if not exists idx_venue_commission_history_venue_id
  on public.venue_commission_history (venue_id);

-- Backfill a row per existing venue at the platform default, so Phase B's
-- venue detail page always has something to read.
insert into public.venue_commission (venue_id, commission_rate)
select id, 12.00 from public.venues
on conflict (venue_id) do nothing;

-- ============================================================================
-- 4. ADMIN-ONLY COLUMNS ON EXISTING TABLES
-- ============================================================================

-- [ADD] users.status — needed for Phase C's suspend/reactivate action.
-- Nothing in the consumer schema currently reads or writes this column, so
-- adding it is additive and safe.
alter table public.users
  add column if not exists status text not null default 'active';

alter table public.users
  add column if not exists suspension_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_status_check'
  ) then
    alter table public.users
      add constraint users_status_check check (status in ('active', 'suspended'));
  end if;
end $$;

-- [ADD] bookings.payment_status — refund state is not the same axis as
-- booking lifecycle status (a *cancelled* booking might be refunded,
-- partially refunded, or not refunded at all outside the free window).
--
-- CORRECTED against the real partner-app migration (Backend Phase C),
-- which already added this exact column with this exact constraint name
-- (bookings_payment_status_check) — this block's `if not exists` guard
-- meant an earlier version's mismatched 4-value assumption
-- ('pending','paid','refunded','failed') silently never actually applied
-- when run after the partner app's migration, so it was never a live bug
-- — but it's fixed here at the source anyway rather than left relying on
-- guard-ordering to paper over it. There is no 'failed' payment_status
-- anywhere in the real schema; a failed Razorpay/Cashfree attempt simply
-- never reaches 'paid', it stays 'pending' (or the booking itself is
-- cancelled). Phase D should introduce a real 'failed' state only if it
-- actually needs to distinguish "payment attempted and failed" from
-- "never attempted" — not assume one already exists.
alter table public.bookings
  add column if not exists payment_status text not null default 'pending';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_payment_status_check'
  ) then
    alter table public.bookings
      add constraint bookings_payment_status_check
      check (payment_status in ('pending', 'paid', 'refunded'));
  end if;
end $$;

-- ============================================================================
-- 5. ROLE-CHECK HELPER FUNCTIONS
-- ============================================================================
-- These are the ONLY place admin-vs-not logic lives. Every policy below
-- calls one of these three — nothing re-implements the role check inline,
-- and nothing grants a blanket "admins bypass RLS" rule. Each is
-- `security definer` so it can read `admin_users` (which is itself locked
-- down below) without the caller needing their own admin_users select
-- policy just to ask "am I an admin?".

create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.admin_users where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_admin_role() is not null;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_admin_role() = 'super_admin';
$$;

comment on function public.is_admin() is
  'True for both super_admin and ops_support. Use for "any admin can read '
  'this" policies.';
comment on function public.is_super_admin() is
  'True only for super_admin. Use for payout/commission/financial/roles '
  'policies that ops_support must never reach, even read-only.';

-- ============================================================================
-- 6. AUDIT TRIGGER FOR DIRECT (non-Edge-Function) ADMIN WRITES
-- ============================================================================
-- ops_support's day-to-day writes (editing a booking, suspending a user,
-- logging a goodwill credit) go straight through the RLS policies below,
-- not through an Edge Function — there's no cross-system side effect that
-- needs a server-side check beyond "is this role allowed to touch this
-- row", which RLS already expresses. So that these still land in the audit
-- log without every screen having to remember to call something, this
-- trigger does it for them. Edge Functions (Phase B/C/D actions that DO
-- have side effects — approving a venue, calling Razorpay, moving money)
-- are expected to insert their own admin_audit_log row explicitly instead,
-- since they run as service role and this trigger only fires for writes
-- made through a real admin's own RLS-authenticated session.

create or replace function public.log_admin_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_admin uuid := auth.uid();
begin
  if acting_admin is not null and exists (
    select 1 from public.admin_users where id = acting_admin
  ) then
    insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
    values (
      acting_admin,
      lower(TG_TABLE_NAME) || '.' || lower(TG_OP),
      TG_TABLE_NAME,
      (case when TG_OP = 'DELETE' then old.id else new.id end)::text,
      case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end
    );
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_log_admin_write_bookings on public.bookings;
create trigger trg_log_admin_write_bookings
  after insert or update on public.bookings
  for each row execute function public.log_admin_write();

drop trigger if exists trg_log_admin_write_users on public.users;
create trigger trg_log_admin_write_users
  after update on public.users
  for each row execute function public.log_admin_write();

drop trigger if exists trg_log_admin_write_wallet_transactions on public.wallet_transactions;
create trigger trg_log_admin_write_wallet_transactions
  after insert on public.wallet_transactions
  for each row execute function public.log_admin_write();

-- Note: this fires on every write to these tables, including a consumer
-- updating their own profile — but the `exists (select 1 from admin_users
-- where id = acting_admin)` check means it's a no-op (one extra indexed
-- lookup) unless the actor is actually an admin. Consumer/partner traffic
-- never produces a log row.

-- ============================================================================
-- 7. RLS — ADMIN_USERS
-- ============================================================================

alter table public.admin_users enable row level security;

drop policy if exists "admin_users select self" on public.admin_users;
create policy "admin_users select self" on public.admin_users
  for select using (auth.uid() = id);

drop policy if exists "admin_users select all for super admin" on public.admin_users;
create policy "admin_users select all for super admin" on public.admin_users
  for select using (public.is_super_admin());
-- No insert/update/delete policy: managed exclusively by a service-role
-- Edge Function (Phase E — Add/remove admin, change role).

-- ============================================================================
-- 8. RLS — ADMIN_AUDIT_LOG
-- ============================================================================

alter table public.admin_audit_log enable row level security;

drop policy if exists "audit log select all for super admin" on public.admin_audit_log;
create policy "audit log select all for super admin" on public.admin_audit_log
  for select using (public.is_super_admin());

drop policy if exists "audit log select own for ops support" on public.admin_audit_log;
create policy "audit log select own for ops support" on public.admin_audit_log
  for select using (admin_id = auth.uid());
-- No insert/update/delete policy for any client role — see table comment.

-- ============================================================================
-- 9. RLS — VENUE_COMMISSION / VENUE_COMMISSION_HISTORY (super_admin only)
-- ============================================================================

alter table public.venue_commission enable row level security;
alter table public.venue_commission_history enable row level security;

drop policy if exists "venue_commission super admin full access" on public.venue_commission;
create policy "venue_commission super admin full access" on public.venue_commission
  for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "venue_commission_history super admin full access" on public.venue_commission_history;
create policy "venue_commission_history super admin full access" on public.venue_commission_history
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ============================================================================
-- 10. RLS — ADMIN ACCESS ON EXISTING CONSUMER-APP TABLES
-- ============================================================================
-- These are ADDITIONAL policies layered on top of the consumer app's
-- existing ones (own-row, public-read, etc.) — nothing below removes or
-- narrows what the consumer app already grants its own users.

-- --- users: ops_support can read + update (status/suspension); super_admin full ---
drop policy if exists "users admin read" on public.users;
create policy "users admin read" on public.users
  for select using (public.is_admin());

drop policy if exists "users admin update" on public.users;
create policy "users admin update" on public.users
  for update using (public.is_admin()) with check (public.is_admin());
-- (Ops_support can update via this policy today; nothing stops them
-- rewriting `name`/`phone` too since RLS is row- not column-level. Phase C
-- should route the suspend/reactivate action through an Edge Function that
-- only touches `status`/`suspension_reason` if that's a concern.)

-- --- venues / venue_pricing / slots: every admin can read; writes stay ------
-- --- backend/service-role only for now (Phase B introduces the approval ---
-- --- Edge Function that will need its own, more specific write policy). ---
drop policy if exists "venues admin read" on public.venues;
create policy "venues admin read" on public.venues
  for select using (public.is_admin());
-- Note: this intentionally does NOT add an admin update/insert/delete
-- policy yet. Approving a venue also needs to flip the partner's dashboard
-- access flag — a cross-table effect that belongs in Phase B's Edge
-- Function (running as service role), not a direct RLS write.

drop policy if exists "venue_pricing admin read" on public.venue_pricing;
create policy "venue_pricing admin read" on public.venue_pricing
  for select using (public.is_admin());

drop policy if exists "slots admin read" on public.slots;
create policy "slots admin read" on public.slots
  for select using (public.is_admin());

-- --- bookings: ops_support and super_admin can read + write ------------------
drop policy if exists "bookings admin read" on public.bookings;
create policy "bookings admin read" on public.bookings
  for select using (public.is_admin());

drop policy if exists "bookings admin update" on public.bookings;
create policy "bookings admin update" on public.bookings
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "bookings admin insert" on public.bookings;
create policy "bookings admin insert" on public.bookings
  for insert with check (public.is_admin());

-- --- hosted_games / groups / events: admin read (Phase E featured-content) --
drop policy if exists "hosted_games admin read" on public.hosted_games;
create policy "hosted_games admin read" on public.hosted_games
  for select using (public.is_admin());

drop policy if exists "groups admin read" on public.groups;
create policy "groups admin read" on public.groups
  for select using (public.is_admin());

drop policy if exists "events admin read" on public.events;
create policy "events admin read" on public.events
  for select using (public.is_admin());

-- --- wallet_transactions: admin read all; ops_support can INSERT credits ---
-- --- (goodwill credits from Phase C/D's dispute & refund flows) — never ---
-- --- update/delete, so the ledger stays append-only for everyone. --------
drop policy if exists "wallet_transactions admin read" on public.wallet_transactions;
create policy "wallet_transactions admin read" on public.wallet_transactions
  for select using (public.is_admin());

drop policy if exists "wallet_transactions admin insert" on public.wallet_transactions;
create policy "wallet_transactions admin insert" on public.wallet_transactions
  for insert with check (public.is_admin());

-- --- referrals: admin read only (context on a user's profile) --------------
drop policy if exists "referrals admin read" on public.referrals;
create policy "referrals admin read" on public.referrals
  for select using (public.is_admin());

-- ============================================================================
-- 11. RLS — ASSUMED PARTNER-APP TABLES (guarded; adjust to the real schema)
-- ============================================================================
-- Everything in this section only runs `if to_regclass(...) is not null`,
-- i.e. if the table already exists under exactly this name. If the
-- partner app named something differently (e.g. `partner_payout_accounts`
-- instead of `payout_accounts`), these blocks silently do nothing — check
-- the NOTICE-free success of this migration is NOT a guarantee these ran,
-- and grep this file for `to_regclass` to see exactly what was assumed.

do $$
begin
  if to_regclass('public.partners') is not null then
    execute 'alter table public.partners enable row level security';
    execute 'drop policy if exists "partners admin read" on public.partners';
    execute 'create policy "partners admin read" on public.partners for select using (public.is_admin())';
    execute 'drop policy if exists "partners super admin write" on public.partners';
    execute 'create policy "partners super admin write" on public.partners for all using (public.is_super_admin()) with check (public.is_super_admin())';
  end if;

  if to_regclass('public.partner_venues') is not null then
    execute 'alter table public.partner_venues enable row level security';
    execute 'drop policy if exists "partner_venues admin read" on public.partner_venues';
    execute 'create policy "partner_venues admin read" on public.partner_venues for select using (public.is_admin())';
  end if;

  -- Payout family: SUPER_ADMIN ONLY, no exceptions — this is the literal
  -- "NOT payout_accounts, payouts, ..." carve-out from the brief.
  if to_regclass('public.payouts') is not null then
    execute 'alter table public.payouts enable row level security';
    execute 'drop policy if exists "payouts super admin full access" on public.payouts';
    execute 'create policy "payouts super admin full access" on public.payouts for all using (public.is_super_admin()) with check (public.is_super_admin())';
  end if;

  if to_regclass('public.payout_line_items') is not null then
    execute 'alter table public.payout_line_items enable row level security';
    execute 'drop policy if exists "payout_line_items super admin full access" on public.payout_line_items';
    execute 'create policy "payout_line_items super admin full access" on public.payout_line_items for all using (public.is_super_admin()) with check (public.is_super_admin())';
  end if;

  if to_regclass('public.payout_deductions') is not null then
    execute 'alter table public.payout_deductions enable row level security';
    execute 'drop policy if exists "payout_deductions super admin full access" on public.payout_deductions';
    execute 'create policy "payout_deductions super admin full access" on public.payout_deductions for all using (public.is_super_admin()) with check (public.is_super_admin())';
  end if;

  if to_regclass('public.payout_accounts') is not null then
    execute 'alter table public.payout_accounts enable row level security';
    execute 'drop policy if exists "payout_accounts super admin full access" on public.payout_accounts';
    execute 'create policy "payout_accounts super admin full access" on public.payout_accounts for all using (public.is_super_admin()) with check (public.is_super_admin())';
  end if;
end $$;

-- ============================================================================
-- End of Backend Phase A
-- ============================================================================
-- What Phase A deliberately does NOT do yet (by design, per the brief):
--   • No admin write policy on venues/partners (Phase B's approval Edge
--     Function handles that, with the cross-table partner-unlock effect).
--   • No refund_requests table yet — Phase D is the natural home for it,
--     since it needs to reference whatever the Razorpay transaction
--     record ends up being called (not in the table list I was given).
--   • No admin-provisioning Edge Function yet (Phase E — Add/remove admin).
--   • No UI changes beyond swapping the login screen to real Supabase Auth
--     — Phases 2-5's screens still read mock data until Phases B-E land.
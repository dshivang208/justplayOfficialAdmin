-- ============================================================================
-- JustPlay Admin — Backend Phase B: Venue/Partner Approval Workflows
-- ============================================================================
-- Run AFTER 20260901000000_admin_phase_a_schema.sql. Idempotent.
--
-- This phase adds the columns the approval workflow actually needs, then
-- deliberately does NOT add client-writable RLS policies for any of them
-- beyond what's already there — every write described in the brief
-- (approve/reject a venue, edit commission, flag a partner) has a
-- cross-table or audit-trail effect, so all three go through the Edge
-- Functions in supabase/functions/, running as service role, per Phase
-- A's rule: sensitive writes are checked server-side, not via a blanket
-- RLS bypass.
--
-- Schema verification note: the `partners` table's shape (including the
-- approval_status column and its exact constraint name) has since been
-- verified against the real partner-app migration and matches what's
-- assumed below — the `to_regclass`/information_schema guards are kept as
-- normal defensive practice, not because the shape is still unknown. The
-- one real problem found and fixed here: the backfill below used to also
-- auto-approve every pre-existing PENDING partner, which — unlike the
-- venues backfill above — would have bypassed real, already-meaningful
-- partner vetting rather than grandfathering a brand-new concept. Removed.
-- ============================================================================

-- ============================================================================
-- 1. VENUE APPROVAL COLUMNS (real table, no guard needed)
-- ============================================================================

alter table public.venues
  add column if not exists approval_status text not null default 'pending';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'venues_approval_status_check') then
    alter table public.venues
      add constraint venues_approval_status_check
      check (approval_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

alter table public.venues add column if not exists rejection_reason text;
alter table public.venues add column if not exists approved_at timestamptz;
alter table public.venues add column if not exists approved_by uuid references public.admin_users (id) on delete set null;
alter table public.venues add column if not exists deactivation_reason text;

comment on column public.venues.approval_status is
  'pending = awaiting the Venue Approval Queue; approved = live once '
  'is_active is also true; rejected = terminal until the partner '
  'resubmits (out of scope for this phase). Deactivate/reactivate '
  '(Phase 2 UI) toggles is_active, independent of this column.';

-- Existing venues created before this migration (all of them, on a fresh
-- consumer-app database) predate the approval workflow entirely — treat
-- them as already approved rather than retroactively hiding live venues
-- behind a new pending queue they never went through.
update public.venues
set approval_status = 'approved', approved_at = created_at
where approval_status = 'pending' and created_at < now();

-- ============================================================================
-- 2. PARTNER APPROVAL + FLAG COLUMNS (ASSUMED table — guarded)
-- ============================================================================
-- Assumed shape: public.partners(id uuid pk, ...). If the real table uses
-- different column names for "is this partner approved" or "is this
-- partner flagged", the admin-approve-venue and admin-flag-partner Edge
-- Functions below need those names updated to match — they reference
-- `approval_status`, `flagged`, and `flag_reason` directly.

do $$
begin
  if to_regclass('public.partners') is not null then

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'partners' and column_name = 'approval_status'
    ) then
      execute $ddl$
        alter table public.partners add column approval_status text not null default 'pending'
      $ddl$;
    end if;

    if not exists (select 1 from pg_constraint where conname = 'partners_approval_status_check') then
      execute $ddl$
        alter table public.partners add constraint partners_approval_status_check
        check (approval_status in ('pending', 'approved', 'rejected'))
      $ddl$;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'partners' and column_name = 'flagged'
    ) then
      execute $ddl$
        alter table public.partners add column flagged boolean not null default false
      $ddl$;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'partners' and column_name = 'flag_reason'
    ) then
      execute $ddl$ alter table public.partners add column flag_reason text $ddl$;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'partners' and column_name = 'flagged_by'
    ) then
      execute $ddl$
        alter table public.partners add column flagged_by uuid references public.admin_users (id) on delete set null
      $ddl$;
    end if;

    -- NOTE: deliberately NO backfill here, unlike venues above. Venue
    -- approval didn't exist as a concept before this migration, so
    -- grandfathering pre-existing venues in as 'approved' just avoids
    -- retroactively hiding live venues behind a queue they never went
    -- through. Partner approval is different: it already existed and was
    -- meaningful BEFORE this admin app did (see the partner app's own
    -- Phase A — approval_status gates dashboard access via
    -- admin_approve_partner()). A blanket
    -- `update partners set approval_status = 'approved' where pending`
    -- here would silently auto-approve every partner still awaiting real
    -- review, for no reason other than this migration happening to run —
    -- defeating the actual vetting gate rather than grandfathering a new
    -- feature. Approve pending partners for real, one at a time, via
    -- admin-approve-venue (which unlocks the partner once their venue is
    -- approved) or a manual admin_approve_partner() call — never in bulk
    -- via a migration.

  end if;
end $$;

-- ============================================================================
-- 3. RLS — admin update on venues, WITH a guard so it can't be used to
--    bypass the approval workflow
-- ============================================================================
-- Deactivate/reactivate (toggling `is_active` + `deactivation_reason`,
-- Phase 2 UI) is a plain admin action with no cross-table effect, so it's
-- a direct RLS write rather than an Edge Function — unlike approve/reject.
--
-- But RLS is row-level, not column-level: a policy that lets admins
-- UPDATE venues at all technically lets them PATCH approval_status too,
-- which would let a client route around admin-approve-venue (and skip
-- the partner-unlock side effect, and skip the audit log). The trigger
-- below closes that specific gap: it rejects any change to the
-- approval-related columns unless the write is coming from the service
-- role (i.e. an Edge Function), regardless of what RLS itself would have
-- allowed.

drop policy if exists "venues admin update" on public.venues;
create policy "venues admin update" on public.venues
  for update using (public.is_admin()) with check (public.is_admin());

create or replace function public.guard_venue_approval_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user <> 'service_role' then
    if new.approval_status is distinct from old.approval_status
       or new.rejection_reason is distinct from old.rejection_reason
       or new.approved_at is distinct from old.approved_at
       or new.approved_by is distinct from old.approved_by then
      raise exception
        'approval_status/rejection_reason/approved_at/approved_by can only be '
        'changed via the admin-approve-venue Edge Function, not a direct update.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_venue_approval_columns on public.venues;
create trigger trg_guard_venue_approval_columns
  before update on public.venues
  for each row execute function public.guard_venue_approval_columns();

-- Same audit-trigger pattern Phase A attached to bookings/users/
-- wallet_transactions, now also on venues (deactivate/reactivate, edit
-- override) and — if it exists — partners (super_admin's direct write
-- policy from Phase A). Edge-Function-driven changes (approve/reject,
-- commission) already log their own, more detailed audit_log rows and
-- run as service_role, so this trigger's no-op-for-service-role behavior
-- means they won't be double-logged.
drop trigger if exists trg_log_admin_write_venues on public.venues;
create trigger trg_log_admin_write_venues
  after update on public.venues
  for each row execute function public.log_admin_write();

do $$
begin
  if to_regclass('public.partners') is not null then
    execute 'drop trigger if exists trg_log_admin_write_partners on public.partners';
    execute 'create trigger trg_log_admin_write_partners after update on public.partners for each row execute function public.log_admin_write()';
  end if;
end $$;

-- partners (if it exists): Phase A already granted admins read
-- (`partners admin read`) and super-admin-only write
-- (`partners super admin write`). The flag/suspend action goes through
-- admin-flag-partner instead of that direct write policy so BOTH roles
-- can flag a partner (matches the Phase 2/5 UI, which never restricted
-- this to super_admin — only payout/commission/financial access is
-- role-gated) while still recording who did it and why. The same
-- row-vs-column concern applies here in principle (an admin update
-- policy would technically allow editing `approval_status` directly
-- too) — but Phase A's partner write policy is already super-admin-only
-- and ops_support has no partners write policy at all, so ops_support
-- literally cannot reach partners.approval_status by any path except
-- admin-flag-partner (which never touches it). No extra trigger needed
-- on this table for that reason.
--
-- venue_commission / venue_commission_history: already super-admin-only
-- via Phase A's `for all using (is_super_admin())` policy. A super admin
-- COULD update venue_commission directly and skip the Edge Function, but
-- then no history row or audit-log entry would exist — the Edge Function
-- is what makes the rate change and its paper trail atomic. Nothing
-- stops a determined super_admin from bypassing it via raw SQL access to
-- their own project, which is expected: they're already trusted with
-- full data access at that point.

-- ============================================================================
-- End of Backend Phase B (schema)
-- ============================================================================
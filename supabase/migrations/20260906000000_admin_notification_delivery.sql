-- ============================================================================
-- JustPlay Admin — Backend Phase E follow-up: real notification delivery
-- ============================================================================
-- Two real, working delivery channels, replacing the "logs intent only"
-- version:
--   1. In-app: a genuine per-user inbox (user_notifications), which the
--      consumer app now reads for real via a bell in its own nav.
--   2. SMS: real Twilio delivery (admin-send-notification, service role
--      only — Twilio credentials never touch the client).
--
-- What's deliberately NOT included: OS-level push (FCM/APNs). That needs
-- device-token registration in an actual mobile client and a push
-- provider — infrastructure that doesn't exist anywhere in this codebase
-- yet, not something a migration + Edge Function can "wire up". In-app +
-- SMS are the two channels that were actually achievable for real here.
-- ============================================================================

create table if not exists public.user_notifications (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users (id) on delete cascade,
  message             text not null,
  notification_log_id uuid references public.notifications_log (id) on delete set null,
  created_at          timestamptz not null default now(),
  read_at             timestamptz
);

create index if not exists idx_user_notifications_user_id on public.user_notifications (user_id, created_at desc);

alter table public.user_notifications enable row level security;

drop policy if exists "user_notifications select own" on public.user_notifications;
create policy "user_notifications select own" on public.user_notifications
  for select using (auth.uid() = user_id);

-- Only the read/unread state is ever client-writable — a user marking
-- their own notification as read. Everything else (the message itself,
-- who it's for) is written only by admin-send-notification, service role.
drop policy if exists "user_notifications mark read" on public.user_notifications;
create policy "user_notifications mark read" on public.user_notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.notifications_log add column if not exists channels jsonb not null default '{"inApp": true, "sms": false}'::jsonb;
alter table public.notifications_log add column if not exists sms_sent_count integer not null default 0;
alter table public.notifications_log add column if not exists sms_failed_count integer not null default 0;

comment on column public.notifications_log.channels is
  'Which channels this send actually attempted — {"inApp": bool, "sms": bool}. '
  'SMS defaults to false: a real send costs real money and hits a real '
  'rate limit, so it is an admin opt-in per send, not automatic.';

-- Returns the actual user rows for an audience, not just a count — the
-- fan-out target list for both in-app rows and SMS sends. Same audience
-- definitions as admin_notification_audience_count (Phase E), kept in
-- sync deliberately: this is the SET those counts describe.
create or replace function public.admin_notification_audience_users(p_audience text)
returns table (id uuid, name text, phone text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.name, u.phone
  from public.users u
  where public.is_admin()
    and (
      (p_audience = 'all_users')
      or (p_audience = 'inactive_30_days' and not exists (
        select 1 from public.bookings b
        where b.user_id = u.id and b.created_at > now() - interval '30 days'
      ))
      or (p_audience = 'pending_bookings' and exists (
        select 1 from public.bookings b
        where b.user_id = u.id and b.status in ('pending', 'confirmed') and b.date >= current_date
      ))
    );
$$;

grant execute on function public.admin_notification_audience_users(text) to authenticated;
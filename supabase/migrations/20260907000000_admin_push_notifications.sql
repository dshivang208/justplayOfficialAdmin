-- ============================================================================
-- JustPlay Admin — Backend Phase E follow-up #2: real push notifications
-- ============================================================================
-- Real push means the Web Push standard here (RFC 8030 + VAPID, RFC 8292)
-- — this is a web app, not a native mobile app, so there's no FCM/APNs
-- device-token flow to build. Web Push works in-browser (including when
-- the tab is closed, on Chrome/Firefox/Edge; Safari support is more
-- limited) via a service worker + a subscription per browser/device.
--
-- push_subscriptions holds exactly what the Push API's own subscribe()
-- call returns — endpoint + the two keys needed to encrypt a message to
-- it. One row per browser/device a user has opted in from (a user could
-- have several — phone browser, laptop browser, etc).
-- ============================================================================

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user_id on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions manage own" on public.push_subscriptions;
create policy "push_subscriptions manage own" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.notifications_log add column if not exists push_sent_count integer not null default 0;
alter table public.notifications_log add column if not exists push_failed_count integer not null default 0;
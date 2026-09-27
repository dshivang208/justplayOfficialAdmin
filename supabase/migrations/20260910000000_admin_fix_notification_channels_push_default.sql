-- ============================================================================
-- JustPlay Admin — Fix: notifications_log.channels never got a "push" key
-- ============================================================================
-- 20260906000000_admin_notification_delivery.sql and its same-timestamp
-- duplicate ...delivery1.sql both ran (Supabase sorts same-prefix files
-- alphabetically, so `delivery.sql` < `delivery1.sql`). Only the first one's
-- `alter table ... add column if not exists channels ...` actually took
-- effect — its default was `{"inApp": true, "sms": false}`, with no "push"
-- key. The second file's intended default, `{"inApp": true, "sms": false,
-- "push": false}`, silently never applied because the column already
-- existed by the time it ran (`if not exists` is a no-op there).
--
-- 20260907000000_admin_push_notifications.sql then shipped real push
-- delivery (push_subscriptions, push_sent_count, push_failed_count) without
-- ever touching this default — so every notification sent since Phase E's
-- follow-up has had a `channels` value with no "push" flag at all, not even
-- `false`. This migration fixes the default going forward and backfills
-- existing rows so `channels` consistently has all three keys.
--
-- The duplicate `20260906000000_admin_notification_delivery1.sql` file
-- should be deleted from the migrations folder — it never did anything
-- (dead file) and a second migration sharing another's timestamp prefix
-- is invalid practice regardless.
-- ============================================================================

alter table public.notifications_log
  alter column channels set default '{"inApp": true, "sms": false, "push": false}'::jsonb;

update public.notifications_log
set channels = channels || '{"push": false}'::jsonb
where not (channels ? 'push');
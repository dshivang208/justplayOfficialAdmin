-- ============================================================================
-- JustPlay Admin — Fix: notification fan-out always resolved 0 recipients
-- ============================================================================
-- admin_notification_audience_users had `where public.is_admin()` in its
-- body — correct for a function a CLIENT calls directly (which is what
-- admin_notification_audience_count, its sibling, actually is), but this
-- one is only ever called by admin-send-notification via the SERVICE
-- ROLE client. Service-role requests carry no `auth.uid()` at all, so
-- is_admin() always evaluated false, the WHERE clause silently filtered
-- out every single user, and the function returned zero rows regardless
-- of audience — not an error, just an empty result, which is exactly why
-- this failed silently as "0 recipients" instead of visibly erroring.
--
-- Fixed by dropping the is_admin() check (redundant anyway —
-- admin-send-notification already verifies the caller is a real admin
-- via requireAdmin() BEFORE ever calling this) and, just as important,
-- properly restricting who can call it: it was granted to `authenticated`,
-- which combined with no other check meant ANY signed-in consumer could
-- call it directly and get back every user's name + phone. Locked to
-- service_role only now, matching record_reconciliation_check's own
-- service-role-only pattern (Phase D) — this function was never meant to
-- be client-callable at all.
-- ============================================================================

create or replace function public.admin_notification_audience_users(p_audience text)
returns table (id uuid, name text, phone text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.name, u.phone
  from public.users u
  where (
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

revoke all on function public.admin_notification_audience_users(text) from public, authenticated, anon;
grant execute on function public.admin_notification_audience_users(text) to service_role;
-- SECURITY FIX (already applied to the live project).
-- _venue_group_assert_admin() allowed any caller through because it tested
-- `current_user in ('postgres','service_role')` — but inside a SECURITY
-- DEFINER function current_user is always the function owner (postgres).
-- Any signed-in user could therefore list venues via
-- admin_list_venue_group_access() and switch the facility on/off for any venue.
create or replace function public._venue_group_assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return;
  end if;
  if to_regprocedure('public.is_admin()') is not null then
    execute 'select public.is_admin()' into v_ok;
    if coalesce(v_ok, false) then
      return;
    end if;
  end if;
  raise exception 'NOT_ALLOWED';
end;
$$;

revoke all on function public._venue_group_assert_admin() from public, anon, authenticated;

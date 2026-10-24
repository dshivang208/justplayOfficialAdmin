-- Lets any admin see who else is on the team (id + name only), so the
-- support inbox can show "Rahul is handling this". Ops/Support admins can't
-- read admin_users directly (RLS: self only), so this is a narrow RPC.
create or replace function public.admin_team_names()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.name from public.admin_users a where public.is_admin() order by a.created_at;
$$;
grant execute on function public.admin_team_names() to authenticated;

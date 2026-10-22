-- ============================================================================
-- JustPlay — Venue Community Group (optional, admin-gated)
-- ============================================================================
-- A venue owner can open ONE announcement group for their venue. Consumers
-- join it from that venue's detail page (and only there) and receive the
-- owner's updates in a read-only, realtime feed. The owner posts updates
-- from the Partner app.
--
-- Three layers of control, all enforced here in the database:
--   1. ADMIN switch   — public.venue_group_access.enabled, per venue. Off by
--                       default. Only admin_set_venue_group_access() (admin /
--                       service role) can change it.
--   2. OWNER switch   — the owner decides whether to create the group at all,
--                       and can pause (hide) or delete it later.
--   3. CONSUMER side  — nothing is visible unless (1) is on AND the group is
--                       active AND the venue is active.
--
-- Deliberately SEPARATE from the consumer app's `groups` tables so venue
-- groups never show up on /groups, in "my groups", or in group search.
--
-- Safe to re-run. Run AFTER the partner Phase A–E migrations (uses
-- partner_role_for_venue()). Both apps share one Supabase project, so this
-- needs applying once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.venue_group_access (
  venue_id    uuid primary key references public.venues (id) on delete cascade,
  enabled     boolean not null default false,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

create table if not exists public.venue_groups (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid not null unique references public.venues (id) on delete cascade,
  name         text not null,
  description  text,
  is_active    boolean not null default true,
  created_by   uuid references public.partners (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint venue_groups_name_len check (char_length(trim(name)) between 2 and 60),
  constraint venue_groups_desc_len check (description is null or char_length(description) <= 300)
);

create table if not exists public.venue_group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.venue_groups (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  joined_at  timestamptz not null default now(),

  constraint venue_group_members_unique unique (group_id, user_id)
);

create index if not exists venue_group_members_user_idx on public.venue_group_members (user_id);

-- Messages are always "from the venue" — no sender column on purpose, so
-- nothing about the posting partner's identity is ever readable by consumers.
create table if not exists public.venue_group_messages (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.venue_groups (id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),

  constraint venue_group_messages_body_len
    check (char_length(trim(body)) between 1 and 1000)
);

create index if not exists venue_group_messages_group_idx
  on public.venue_group_messages (group_id, created_at);

-- ---------------------------------------------------------------------------
-- 2. Helpers (SECURITY DEFINER so RLS policies never recurse into each other)
-- ---------------------------------------------------------------------------

create or replace function public.venue_group_access_enabled(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select a.enabled from public.venue_group_access a where a.venue_id = p_venue_id),
    false
  );
$$;

grant execute on function public.venue_group_access_enabled(uuid) to anon, authenticated;

-- Is this group currently visible to consumers?
create or replace function public.venue_group_is_live(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.venue_groups g
    join public.venues v on v.id = g.venue_id and v.is_active = true
    where g.id = p_group_id
      and g.is_active
      and public.venue_group_access_enabled(g.venue_id)
  );
$$;

grant execute on function public.venue_group_is_live(uuid) to anon, authenticated;

-- Is the caller a partner (owner or staff) of the venue this group belongs to?
create or replace function public.venue_group_is_partner(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.venue_groups g
    where g.id = p_group_id
      and public.partner_role_for_venue(g.venue_id) is not null
  );
$$;

grant execute on function public.venue_group_is_partner(uuid) to authenticated;

-- May the caller read this group's messages? Members of a LIVE group, or the
-- venue's own partners (who keep read access even while paused/disabled).
create or replace function public.venue_group_can_read(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.venue_group_is_partner(p_group_id)
    or (
      public.venue_group_is_live(p_group_id)
      and exists (
        select 1 from public.venue_group_members m
        where m.group_id = p_group_id and m.user_id = auth.uid()
      )
    );
$$;

grant execute on function public.venue_group_can_read(uuid) to authenticated;

-- Owner of an approved partner account? Raises otherwise.
create or replace function public._venue_group_assert_owner(p_venue_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if public.partner_role_for_venue(p_venue_id) is distinct from 'owner' then
    raise exception 'NOT_ALLOWED';
  end if;
  if not exists (
    select 1 from public.partners p
    where p.id = auth.uid() and p.approval_status = 'approved'
  ) then
    raise exception 'NOT_ALLOWED';
  end if;
end;
$$;

revoke all on function public._venue_group_assert_owner(uuid) from public, anon, authenticated;

-- Admin / service-role gate. The admin app defines its own public.is_admin()
-- in this shared project; it's looked up dynamically so this migration still
-- applies cleanly if that function doesn't exist yet (then only the service
-- role can flip the switch).
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
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'service_role') then
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

-- ---------------------------------------------------------------------------
-- 3. RLS — reads only; EVERY write goes through the RPCs below
-- ---------------------------------------------------------------------------

alter table public.venue_group_access   enable row level security;
alter table public.venue_groups         enable row level security;
alter table public.venue_group_members  enable row level security;
alter table public.venue_group_messages enable row level security;

-- A venue's partners can see whether the feature is switched on for them.
drop policy if exists "venue_group_access partner read" on public.venue_group_access;
create policy "venue_group_access partner read" on public.venue_group_access
  for select to authenticated
  using (public.partner_role_for_venue(venue_id) is not null);

-- Consumers (signed-out and signed-in): only live groups. Partners: their own
-- venue's group in any state. Two policies because `anon` cannot execute
-- partner_role_for_venue(), and an unexecutable function inside a policy
-- would error for every signed-out read.
drop policy if exists "venue_groups read" on public.venue_groups;
drop policy if exists "venue_groups public read live" on public.venue_groups;
create policy "venue_groups public read live" on public.venue_groups
  for select to anon, authenticated
  using (public.venue_group_is_live(id));

drop policy if exists "venue_groups partner read own" on public.venue_groups;
create policy "venue_groups partner read own" on public.venue_groups
  for select to authenticated
  using (public.partner_role_for_venue(venue_id) is not null);

-- Members see their own membership rows; partners can count their roster.
drop policy if exists "venue_group_members read" on public.venue_group_members;
create policy "venue_group_members read" on public.venue_group_members
  for select to authenticated
  using (user_id = auth.uid() or public.venue_group_is_partner(group_id));

drop policy if exists "venue_group_messages read" on public.venue_group_messages;
create policy "venue_group_messages read" on public.venue_group_messages
  for select to authenticated
  using (public.venue_group_can_read(group_id));

-- Belt and braces: no direct writes from any client role.
revoke insert, update, delete on public.venue_group_access   from anon, authenticated;
revoke insert, update, delete on public.venue_groups         from anon, authenticated;
revoke insert, update, delete on public.venue_group_members  from anon, authenticated;
revoke insert, update, delete on public.venue_group_messages from anon, authenticated;

revoke all on public.venue_group_access, public.venue_group_members, public.venue_group_messages from anon;
grant select on public.venue_group_access   to authenticated;
grant select on public.venue_groups         to anon, authenticated;
grant select on public.venue_group_members  to authenticated;
grant select on public.venue_group_messages to authenticated;

-- ---------------------------------------------------------------------------
-- 4. ADMIN RPCs
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_venue_group_access(p_venue_id uuid, p_enabled boolean)
returns public.venue_group_access
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.venue_group_access;
begin
  perform public._venue_group_assert_admin();

  if not exists (select 1 from public.venues where id = p_venue_id) then
    raise exception 'VENUE_NOT_FOUND';
  end if;

  insert into public.venue_group_access (venue_id, enabled, updated_by, updated_at)
  values (p_venue_id, coalesce(p_enabled, false), auth.uid(), now())
  on conflict (venue_id) do update
    set enabled = excluded.enabled,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.admin_set_venue_group_access(uuid, boolean) to authenticated;

-- One row per venue, for an admin "who has the facility" screen.
create or replace function public.admin_list_venue_group_access()
returns table (
  venue_id      uuid,
  venue_name    text,
  area          text,
  enabled       boolean,
  has_group     boolean,
  group_name    text,
  group_active  boolean,
  member_count  bigint,
  updated_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._venue_group_assert_admin();

  return query
  select
    v.id,
    v.name::text,
    v.area::text,
    coalesce(a.enabled, false),
    g.id is not null,
    g.name::text,
    g.is_active,
    coalesce((select count(*) from public.venue_group_members m where m.group_id = g.id), 0),
    a.updated_at
  from public.venues v
  left join public.venue_group_access a on a.venue_id = v.id
  left join public.venue_groups g on g.venue_id = v.id
  order by coalesce(a.enabled, false) desc, v.name;
end;
$$;

grant execute on function public.admin_list_venue_group_access() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. PARTNER (owner) RPCs
-- ---------------------------------------------------------------------------

create or replace function public.partner_create_venue_group(
  p_venue_id uuid,
  p_name text,
  p_description text default null
)
returns public.venue_groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.venue_groups;
begin
  perform public._venue_group_assert_owner(p_venue_id);

  if not public.venue_group_access_enabled(p_venue_id) then
    raise exception 'FEATURE_NOT_ENABLED';
  end if;
  if p_name is null or char_length(trim(p_name)) < 2 then
    raise exception 'NAME_REQUIRED';
  end if;

  begin
    insert into public.venue_groups (venue_id, name, description, created_by)
    values (
      p_venue_id,
      trim(p_name),
      nullif(trim(coalesce(p_description, '')), ''),
      auth.uid()
    )
    returning * into v_row;
  exception when unique_violation then
    raise exception 'GROUP_EXISTS';
  end;

  return v_row;
end;
$$;

grant execute on function public.partner_create_venue_group(uuid, text, text) to authenticated;

create or replace function public.partner_update_venue_group(
  p_group_id uuid,
  p_name text,
  p_description text default null
)
returns public.venue_groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue uuid;
  v_row   public.venue_groups;
begin
  select venue_id into v_venue from public.venue_groups where id = p_group_id;
  if v_venue is null then raise exception 'GROUP_NOT_FOUND'; end if;

  perform public._venue_group_assert_owner(v_venue);

  if p_name is null or char_length(trim(p_name)) < 2 then
    raise exception 'NAME_REQUIRED';
  end if;

  update public.venue_groups
  set name = trim(p_name),
      description = nullif(trim(coalesce(p_description, '')), ''),
      updated_at = now()
  where id = p_group_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.partner_update_venue_group(uuid, text, text) to authenticated;

-- Pause = hide from consumers without losing members or history.
create or replace function public.partner_set_venue_group_active(p_group_id uuid, p_active boolean)
returns public.venue_groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue uuid;
  v_row   public.venue_groups;
begin
  select venue_id into v_venue from public.venue_groups where id = p_group_id;
  if v_venue is null then raise exception 'GROUP_NOT_FOUND'; end if;

  perform public._venue_group_assert_owner(v_venue);

  if p_active and not public.venue_group_access_enabled(v_venue) then
    raise exception 'FEATURE_NOT_ENABLED';
  end if;

  update public.venue_groups
  set is_active = coalesce(p_active, false), updated_at = now()
  where id = p_group_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.partner_set_venue_group_active(uuid, boolean) to authenticated;

-- Permanent: removes the group, its members and all updates.
create or replace function public.partner_delete_venue_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue uuid;
begin
  select venue_id into v_venue from public.venue_groups where id = p_group_id;
  if v_venue is null then raise exception 'GROUP_NOT_FOUND'; end if;

  perform public._venue_group_assert_owner(v_venue);

  delete from public.venue_groups where id = p_group_id;
end;
$$;

grant execute on function public.partner_delete_venue_group(uuid) to authenticated;

create or replace function public.partner_send_venue_group_message(p_group_id uuid, p_body text)
returns public.venue_group_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue  uuid;
  v_active boolean;
  v_row    public.venue_group_messages;
begin
  select venue_id, is_active into v_venue, v_active
  from public.venue_groups where id = p_group_id;
  if v_venue is null then raise exception 'GROUP_NOT_FOUND'; end if;

  perform public._venue_group_assert_owner(v_venue);

  if not public.venue_group_access_enabled(v_venue) then
    raise exception 'FEATURE_NOT_ENABLED';
  end if;
  if not v_active then
    raise exception 'GROUP_PAUSED';
  end if;
  if p_body is null or char_length(trim(p_body)) = 0 then
    raise exception 'MESSAGE_REQUIRED';
  end if;
  if char_length(trim(p_body)) > 1000 then
    raise exception 'MESSAGE_TOO_LONG';
  end if;

  insert into public.venue_group_messages (group_id, body)
  values (p_group_id, trim(p_body))
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.partner_send_venue_group_message(uuid, text) to authenticated;

create or replace function public.partner_delete_venue_group_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue uuid;
begin
  select g.venue_id into v_venue
  from public.venue_group_messages m
  join public.venue_groups g on g.id = m.group_id
  where m.id = p_message_id;
  if v_venue is null then raise exception 'MESSAGE_NOT_FOUND'; end if;

  perform public._venue_group_assert_owner(v_venue);

  delete from public.venue_group_messages where id = p_message_id;
end;
$$;

grant execute on function public.partner_delete_venue_group_message(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. CONSUMER RPCs
-- ---------------------------------------------------------------------------

-- What the venue detail page calls. Returns zero rows when the venue has no
-- group, the owner paused it, the venue is inactive, or admin hasn't granted
-- the facility — the page then simply renders nothing.
create or replace function public.get_venue_group(p_venue_id uuid)
returns table (
  id            uuid,
  venue_id      uuid,
  name          text,
  description   text,
  member_count  bigint,
  is_member     boolean,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.venue_id,
    g.name::text,
    g.description::text,
    (select count(*) from public.venue_group_members m where m.group_id = g.id),
    exists (
      select 1 from public.venue_group_members m
      where m.group_id = g.id and m.user_id = auth.uid()
    ),
    g.created_at
  from public.venue_groups g
  where g.venue_id = p_venue_id
    and public.venue_group_is_live(g.id);
$$;

grant execute on function public.get_venue_group(uuid) to anon, authenticated;

create or replace function public.join_venue_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  if not public.venue_group_is_live(p_group_id) then
    raise exception 'GROUP_UNAVAILABLE';
  end if;

  insert into public.venue_group_members (group_id, user_id)
  values (p_group_id, v_user)
  on conflict (group_id, user_id) do nothing;
end;
$$;

grant execute on function public.join_venue_group(uuid) to authenticated;

create or replace function public.leave_venue_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  delete from public.venue_group_members
  where group_id = p_group_id and user_id = auth.uid();
end;
$$;

grant execute on function public.leave_venue_group(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Realtime — new updates reach open consumer tabs and the owner console
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'venue_group_messages'
  ) then
    alter publication supabase_realtime add table public.venue_group_messages;
  end if;
end $$;
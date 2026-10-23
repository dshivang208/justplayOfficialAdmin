-- ============================================================================
-- Support tickets — players raise them in the consumer app, admins answer them
-- in the admin app. Real two-way conversation, status tracking, internal notes.
-- ============================================================================
-- Run once in the Supabase SQL editor. Safe to re-run.
--
--  * support_tickets          one row per request (ticket_no is the friendly #)
--  * support_ticket_messages  the conversation; admin "internal" notes are
--                             never visible to the player (RLS enforces it)
--  * All writes go through SECURITY DEFINER RPCs that check who is calling,
--    rate-limit abuse, and keep status / timestamps consistent.
--  * When an admin replies, the player also gets an in-app notification.
-- ============================================================================

create table if not exists public.support_tickets (
  id               uuid primary key default gen_random_uuid(),
  ticket_no        bigint generated always as identity,
  user_id          uuid not null references public.users (id) on delete cascade,
  subject          text not null,
  category         text not null default 'other',
  priority         text not null default 'normal',
  status           text not null default 'open',
  booking_id       uuid references public.bookings (id) on delete set null,
  assigned_admin_id uuid references public.admin_users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now(),
  last_sender_kind text not null default 'user',
  resolved_at      timestamptz,

  constraint support_tickets_subject_len check (char_length(trim(subject)) between 3 and 120),
  constraint support_tickets_category_check
    check (category in ('booking', 'payment_refund', 'venue', 'account', 'game_group', 'other')),
  constraint support_tickets_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint support_tickets_status_check
    check (status in ('open', 'in_progress', 'waiting_user', 'resolved', 'closed')),
  constraint support_tickets_sender_check check (last_sender_kind in ('user', 'admin'))
);

create unique index if not exists idx_support_tickets_no on public.support_tickets (ticket_no);
create index if not exists idx_support_tickets_user on public.support_tickets (user_id, last_message_at desc);
create index if not exists idx_support_tickets_status on public.support_tickets (status, last_message_at desc);

create table if not exists public.support_ticket_messages (
  id             uuid primary key default gen_random_uuid(),
  ticket_id      uuid not null references public.support_tickets (id) on delete cascade,
  sender_kind    text not null,
  sender_user_id uuid,
  body           text not null,
  internal       boolean not null default false,
  created_at     timestamptz not null default now(),

  constraint support_msg_kind_check check (sender_kind in ('user', 'admin')),
  constraint support_msg_body_len check (char_length(trim(body)) between 1 and 2000),
  constraint support_msg_internal_admin check (not internal or sender_kind = 'admin')
);

create index if not exists idx_support_msgs_ticket on public.support_ticket_messages (ticket_id, created_at);

-- ── RLS: read-only for clients; every write goes through the RPCs below ────
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

drop policy if exists "support_tickets select own or admin" on public.support_tickets;
create policy "support_tickets select own or admin" on public.support_tickets
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "support_msgs select own or admin" on public.support_ticket_messages;
create policy "support_msgs select own or admin" on public.support_ticket_messages
  for select to authenticated
  using (
    public.is_admin()
    or (
      internal = false
      and exists (
        select 1 from public.support_tickets t
        where t.id = ticket_id and t.user_id = auth.uid()
      )
    )
  );

-- ── Player: raise a ticket ────────────────────────────────────────────────
create or replace function public.create_support_ticket(
  p_subject    text,
  p_category   text,
  p_message    text,
  p_booking_id uuid default null
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.support_tickets;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(trim(coalesce(p_subject, ''))) < 3 then raise exception 'SUBJECT_REQUIRED'; end if;
  if char_length(trim(coalesce(p_message, ''))) < 10 then raise exception 'MESSAGE_TOO_SHORT'; end if;
  if char_length(p_message) > 2000 then raise exception 'MESSAGE_TOO_LONG'; end if;
  if p_category not in ('booking', 'payment_refund', 'venue', 'account', 'game_group', 'other') then
    raise exception 'INVALID_CATEGORY';
  end if;

  if p_booking_id is not null and not exists (
    select 1 from public.bookings where id = p_booking_id and user_id = v_user
  ) then raise exception 'INVALID_BOOKING'; end if;

  -- Abuse guards: at most 10 unresolved tickets, and 5 new ones per hour.
  if (select count(*) from public.support_tickets
      where user_id = v_user and status in ('open', 'in_progress', 'waiting_user')) >= 10 then
    raise exception 'TOO_MANY_OPEN';
  end if;
  if (select count(*) from public.support_tickets
      where user_id = v_user and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'TOO_FAST';
  end if;

  insert into public.support_tickets (user_id, subject, category, booking_id,
    priority)
  values (
    v_user, left(trim(p_subject), 120), p_category, p_booking_id,
    case when p_category = 'payment_refund' then 'high' else 'normal' end
  )
  returning * into v_row;

  insert into public.support_ticket_messages (ticket_id, sender_kind, sender_user_id, body)
  values (v_row.id, 'user', v_user, trim(p_message));

  return v_row;
end;
$$;

grant execute on function public.create_support_ticket(text, text, text, uuid) to authenticated;

-- ── Player: reply on their own ticket ─────────────────────────────────────
create or replace function public.add_support_message(p_ticket_id uuid, p_body text)
returns public.support_ticket_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_ticket public.support_tickets;
  v_row    public.support_ticket_messages;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_ticket from public.support_tickets where id = p_ticket_id and user_id = v_user;
  if v_ticket.id is null then raise exception 'TICKET_NOT_FOUND'; end if;
  if v_ticket.status = 'closed' then raise exception 'TICKET_CLOSED'; end if;
  if char_length(trim(coalesce(p_body, ''))) < 1 then raise exception 'MESSAGE_REQUIRED'; end if;
  if char_length(p_body) > 2000 then raise exception 'MESSAGE_TOO_LONG'; end if;

  if (select count(*) from public.support_ticket_messages
      where sender_user_id = v_user and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'TOO_FAST';
  end if;

  insert into public.support_ticket_messages (ticket_id, sender_kind, sender_user_id, body)
  values (p_ticket_id, 'user', v_user, trim(p_body))
  returning * into v_row;

  -- A reply puts the ticket back in the team's queue (and reopens a resolved one).
  update public.support_tickets
  set status = case when status in ('resolved', 'waiting_user') then 'open' else status end,
      resolved_at = case when status = 'resolved' then null else resolved_at end,
      last_message_at = now(), last_sender_kind = 'user', updated_at = now()
  where id = p_ticket_id;

  return v_row;
end;
$$;

grant execute on function public.add_support_message(uuid, text) to authenticated;

-- ── Player: mark their own ticket as solved ───────────────────────────────
create or replace function public.resolve_my_support_ticket(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.support_tickets
  set status = 'resolved', resolved_at = now(), updated_at = now()
  where id = p_ticket_id and user_id = auth.uid() and status not in ('closed', 'resolved');
  if not found then raise exception 'TICKET_NOT_FOUND'; end if;
end;
$$;

grant execute on function public.resolve_my_support_ticket(uuid) to authenticated;

-- ── Admin: reply / internal note ──────────────────────────────────────────
create or replace function public.admin_reply_support_ticket(
  p_ticket_id uuid,
  p_body      text,
  p_internal  boolean default false,
  p_status    text default null
)
returns public.support_ticket_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets;
  v_row    public.support_ticket_messages;
  v_status text;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  select * into v_ticket from public.support_tickets where id = p_ticket_id;
  if v_ticket.id is null then raise exception 'TICKET_NOT_FOUND'; end if;
  if char_length(trim(coalesce(p_body, ''))) < 1 then raise exception 'MESSAGE_REQUIRED'; end if;
  if char_length(p_body) > 2000 then raise exception 'MESSAGE_TOO_LONG'; end if;
  if p_status is not null and p_status not in ('open', 'in_progress', 'waiting_user', 'resolved', 'closed') then
    raise exception 'INVALID_STATUS';
  end if;

  insert into public.support_ticket_messages (ticket_id, sender_kind, sender_user_id, body, internal)
  values (p_ticket_id, 'admin', auth.uid(), trim(p_body), coalesce(p_internal, false))
  returning * into v_row;

  if coalesce(p_internal, false) then
    -- Internal notes never touch the player-facing state.
    update public.support_tickets set updated_at = now() where id = p_ticket_id;
  else
    v_status := coalesce(p_status,
      case when v_ticket.status in ('open', 'in_progress') then 'waiting_user' else v_ticket.status end);
    update public.support_tickets
    set status = v_status,
        resolved_at = case when v_status = 'resolved' then coalesce(resolved_at, now()) else null end,
        assigned_admin_id = coalesce(assigned_admin_id, auth.uid()),
        last_message_at = now(), last_sender_kind = 'admin', updated_at = now()
    where id = p_ticket_id;

    insert into public.user_notifications (user_id, message)
    values (
      v_ticket.user_id,
      'Support replied on ticket #' || v_ticket.ticket_no || ': ' || left(trim(p_body), 120)
    );
  end if;

  return v_row;
end;
$$;

grant execute on function public.admin_reply_support_ticket(uuid, text, boolean, text) to authenticated;

-- ── Admin: change status / priority / assignment ──────────────────────────
-- p_assign: true = assign to me, false = unassign, null = leave as is.
create or replace function public.admin_update_support_ticket(
  p_ticket_id uuid,
  p_status    text default null,
  p_priority  text default null,
  p_assign    boolean default null
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.support_tickets;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  if p_status is not null and p_status not in ('open', 'in_progress', 'waiting_user', 'resolved', 'closed') then
    raise exception 'INVALID_STATUS';
  end if;
  if p_priority is not null and p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'INVALID_PRIORITY';
  end if;

  update public.support_tickets
  set status   = coalesce(p_status, status),
      priority = coalesce(p_priority, priority),
      assigned_admin_id = case
        when p_assign is true then auth.uid()
        when p_assign is false then null
        else assigned_admin_id end,
      resolved_at = case
        when coalesce(p_status, status) in ('resolved', 'closed') then coalesce(resolved_at, now())
        else null end,
      updated_at = now()
  where id = p_ticket_id
  returning * into v_row;

  if v_row.id is null then raise exception 'TICKET_NOT_FOUND'; end if;
  return v_row;
end;
$$;

grant execute on function public.admin_update_support_ticket(uuid, text, text, boolean) to authenticated;

-- ── Admin: queue counts for the inbox header ──────────────────────────────
create or replace function public.admin_support_counts()
returns table (open_count bigint, in_progress_count bigint, waiting_count bigint,
               awaiting_reply_count bigint, resolved_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  return query
  select
    count(*) filter (where status = 'open'),
    count(*) filter (where status = 'in_progress'),
    count(*) filter (where status = 'waiting_user'),
    -- the player spoke last and it's not closed out: needs a human answer
    count(*) filter (where last_sender_kind = 'user' and status in ('open', 'in_progress')),
    count(*) filter (where status in ('resolved', 'closed'))
  from public.support_tickets;
end;
$$;

grant execute on function public.admin_support_counts() to authenticated;

-- ── Realtime (live chat in both apps) ─────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.support_ticket_messages;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.support_tickets;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

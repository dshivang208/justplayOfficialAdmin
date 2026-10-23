-- ============================================================================
-- Partner support — venue owners / staff raise tickets from the Partner app;
-- the JustPlay team answers from the same admin Support inbox as player
-- tickets. Run AFTER 20261023050000_support_tickets.sql. Safe to re-run.
-- ============================================================================
-- A partner ticket belongs to the VENUE: every owner/staff member of that
-- venue sees it (shared inbox), and any of them can reply.
-- ============================================================================

alter table public.support_tickets alter column user_id drop not null;

alter table public.support_tickets
  add column if not exists source     text not null default 'player',
  add column if not exists partner_id uuid references public.partners (id) on delete set null,
  add column if not exists venue_id   uuid references public.venues (id) on delete set null;

alter table public.support_tickets drop constraint if exists support_tickets_source_check;
alter table public.support_tickets add constraint support_tickets_source_check
  check (source in ('player', 'partner'));

alter table public.support_tickets drop constraint if exists support_tickets_requester_check;
alter table public.support_tickets add constraint support_tickets_requester_check
  check (
    (source = 'player'  and user_id is not null)
    or (source = 'partner' and venue_id is not null)
  );

alter table public.support_tickets drop constraint if exists support_tickets_category_check;
alter table public.support_tickets add constraint support_tickets_category_check
  check (category in (
    'booking', 'payment_refund', 'venue', 'account', 'game_group', 'other',
    'payout', 'slots_inventory', 'venue_profile', 'app_issue'
  ));

create index if not exists idx_support_tickets_venue on public.support_tickets (venue_id, last_message_at desc);

-- ── Read access: players (own), partners (their venue's), admins (all) ────
drop policy if exists "support_tickets select own or admin" on public.support_tickets;
create policy "support_tickets select own or admin" on public.support_tickets
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or (source = 'partner' and venue_id is not null
        and public.partner_role_for_venue(venue_id) is not null)
  );

drop policy if exists "support_msgs select own or admin" on public.support_ticket_messages;
create policy "support_msgs select own or admin" on public.support_ticket_messages
  for select to authenticated
  using (
    public.is_admin()
    or (
      internal = false
      and exists (
        select 1 from public.support_tickets t
        where t.id = ticket_id
          and (
            t.user_id = auth.uid()
            or (t.source = 'partner' and t.venue_id is not null
                and public.partner_role_for_venue(t.venue_id) is not null)
          )
      )
    )
  );

-- ── Partner: raise a ticket ───────────────────────────────────────────────
create or replace function public.create_partner_support_ticket(
  p_venue_id uuid,
  p_subject  text,
  p_category text,
  p_message  text
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_row public.support_tickets;
begin
  if v_me is null then raise exception 'AUTH_REQUIRED'; end if;
  if public.partner_role_for_venue(p_venue_id) is null then raise exception 'NOT_ALLOWED'; end if;
  if char_length(trim(coalesce(p_subject, ''))) < 3 then raise exception 'SUBJECT_REQUIRED'; end if;
  if char_length(trim(coalesce(p_message, ''))) < 10 then raise exception 'MESSAGE_TOO_SHORT'; end if;
  if char_length(p_message) > 2000 then raise exception 'MESSAGE_TOO_LONG'; end if;
  if p_category not in ('booking', 'payout', 'slots_inventory', 'venue_profile', 'account', 'app_issue', 'other') then
    raise exception 'INVALID_CATEGORY';
  end if;

  if (select count(*) from public.support_tickets
      where venue_id = p_venue_id and source = 'partner'
        and status in ('open', 'in_progress', 'waiting_user')) >= 10 then
    raise exception 'TOO_MANY_OPEN';
  end if;
  if (select count(*) from public.support_tickets
      where partner_id = v_me and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'TOO_FAST';
  end if;

  insert into public.support_tickets (source, partner_id, venue_id, subject, category, priority)
  values ('partner', v_me, p_venue_id, left(trim(p_subject), 120), p_category,
          case when p_category = 'payout' then 'high' else 'normal' end)
  returning * into v_row;

  insert into public.support_ticket_messages (ticket_id, sender_kind, sender_user_id, body)
  values (v_row.id, 'user', v_me, trim(p_message));

  return v_row;
end;
$$;

grant execute on function public.create_partner_support_ticket(uuid, text, text, text) to authenticated;

-- ── Partner: reply on a venue ticket ──────────────────────────────────────
create or replace function public.partner_add_support_message(p_ticket_id uuid, p_body text)
returns public.support_ticket_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_ticket public.support_tickets;
  v_row    public.support_ticket_messages;
begin
  if v_me is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_ticket from public.support_tickets where id = p_ticket_id and source = 'partner';
  if v_ticket.id is null or public.partner_role_for_venue(v_ticket.venue_id) is null then
    raise exception 'TICKET_NOT_FOUND';
  end if;
  if v_ticket.status = 'closed' then raise exception 'TICKET_CLOSED'; end if;
  if char_length(trim(coalesce(p_body, ''))) < 1 then raise exception 'MESSAGE_REQUIRED'; end if;
  if char_length(p_body) > 2000 then raise exception 'MESSAGE_TOO_LONG'; end if;
  if (select count(*) from public.support_ticket_messages
      where sender_user_id = v_me and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'TOO_FAST';
  end if;

  insert into public.support_ticket_messages (ticket_id, sender_kind, sender_user_id, body)
  values (p_ticket_id, 'user', v_me, trim(p_body))
  returning * into v_row;

  update public.support_tickets
  set status = case when status in ('resolved', 'waiting_user') then 'open' else status end,
      resolved_at = case when status = 'resolved' then null else resolved_at end,
      last_message_at = now(), last_sender_kind = 'user', updated_at = now()
  where id = p_ticket_id;

  return v_row;
end;
$$;

grant execute on function public.partner_add_support_message(uuid, text) to authenticated;

create or replace function public.partner_resolve_support_ticket(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_ticket from public.support_tickets where id = p_ticket_id and source = 'partner';
  if v_ticket.id is null or public.partner_role_for_venue(v_ticket.venue_id) is null then
    raise exception 'TICKET_NOT_FOUND';
  end if;
  update public.support_tickets
  set status = 'resolved', resolved_at = now(), updated_at = now()
  where id = p_ticket_id and status not in ('closed', 'resolved');
end;
$$;

grant execute on function public.partner_resolve_support_ticket(uuid) to authenticated;

-- ── Admin reply: same as before, but only players get an in-app notification
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

    if v_ticket.user_id is not null then
      insert into public.user_notifications (user_id, message)
      values (
        v_ticket.user_id,
        'Support replied on ticket #' || v_ticket.ticket_no || ': ' || left(trim(p_body), 120)
      );
    end if;
  end if;

  return v_row;
end;
$$;

grant execute on function public.admin_reply_support_ticket(uuid, text, boolean, text) to authenticated;

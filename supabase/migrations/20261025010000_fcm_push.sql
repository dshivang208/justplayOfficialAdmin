-- ============================================================================
-- Web push via Firebase Cloud Messaging (FCM) for the consumer, partner and
-- admin apps. Replaces the old VAPID `push_subscriptions` flow.
--
--   * push_tokens        one FCM registration token per browser, tagged with the
--                        app it belongs to ('consumer' | 'partner' | 'admin').
--   * register/unregister_push_token()   the ONLY way clients write tokens.
--   * push_config        one row: URL + shared secret of the `send-push` Edge
--                        Function (filled in once, see setup guide).
--   * triggers           in-app notification rows now also fire a push, so
--                        everything that already shows in a bell rings a phone:
--                          user_notifications     -> consumer
--                          partner_notifications  -> partner
--                          new support message    -> admins
--                          venue awaiting approval-> admins
--                        plus booking confirmed / cancelled-by-venue -> consumer.
--
-- Pushes are sent asynchronously through pg_net and every trigger swallows its
-- own errors, so a push problem can NEVER block a booking, payout or ticket.
-- Idempotent — safe to re-run.
-- ============================================================================

create extension if not exists pg_net with schema extensions;

-- ── 1. Tokens ───────────────────────────────────────────────────────────────
create table if not exists public.push_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  app          text not null check (app in ('consumer', 'partner', 'admin')),
  token        text not null unique,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists idx_push_tokens_user_app on public.push_tokens (user_id, app);

alter table public.push_tokens enable row level security;
-- Read-only for the owner (so a client can check whether it is registered);
-- writes only through the RPCs below.
drop policy if exists "push_tokens select own" on public.push_tokens;
create policy "push_tokens select own" on public.push_tokens
  for select to authenticated using (user_id = auth.uid());

create or replace function public.register_push_token(p_token text, p_app text, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_app not in ('consumer', 'partner', 'admin') then raise exception 'INVALID_APP'; end if;
  if p_token is null or length(p_token) < 20 then raise exception 'INVALID_TOKEN'; end if;
  if p_app = 'admin' and not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;

  -- A shared browser: the token follows whoever is signed in right now.
  insert into public.push_tokens (user_id, app, token, user_agent)
  values (auth.uid(), p_app, p_token, left(p_user_agent, 300))
  on conflict (token) do update
    set user_id = excluded.user_id, app = excluded.app,
        user_agent = excluded.user_agent, last_seen_at = now();

  -- Keep only the 10 most recent browsers per user per app.
  delete from public.push_tokens
  where id in (
    select id from public.push_tokens
    where user_id = auth.uid() and app = p_app
    order by last_seen_at desc offset 10
  );
end;
$$;
grant execute on function public.register_push_token(text, text, text) to authenticated;

create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;
grant execute on function public.unregister_push_token(text) to authenticated;

-- ── 2. Edge Function config (single row, never readable by clients) ─────────
create table if not exists public.push_config (
  id           boolean primary key default true check (id),
  function_url text not null,
  secret       text not null
);
alter table public.push_config enable row level security;  -- no policies = no client access

-- ── 3. Enqueue helper ───────────────────────────────────────────────────────
create or replace function public._push_enqueue(
  p_user_ids uuid[], p_app text, p_title text, p_body text, p_url text default '/'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.push_config;
begin
  select * into cfg from public.push_config where id;
  if not found or p_user_ids is null or array_length(p_user_ids, 1) is null then return; end if;
  -- Nothing to do unless somebody actually registered a browser.
  if not exists (select 1 from public.push_tokens where user_id = any (p_user_ids) and app = p_app) then
    return;
  end if;

  perform net.http_post(
    url     := cfg.function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', cfg.secret),
    body    := jsonb_build_object(
      'user_ids', to_jsonb(p_user_ids),
      'app',      p_app,
      'title',    left(coalesce(p_title, 'JustPlay'), 120),
      'body',     left(coalesce(p_body, ''), 300),
      'url',      coalesce(p_url, '/')
    )
  );
exception when others then
  null; -- never let a push problem break the transaction that triggered it
end;
$$;
revoke all on function public._push_enqueue(uuid[], text, text, text, text) from public, anon, authenticated;

create or replace function public._admin_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$ select coalesce(array_agg(id), '{}') from public.admin_users; $$;
revoke all on function public._admin_ids() from public, anon, authenticated;

-- ── 4. Consumer: every in-app notification also pushes ──────────────────────
-- Admin broadcasts (notification_log_id set) are pushed by the broadcast
-- function itself, only if the admin ticked "push" — so they're skipped here.
create or replace function public.trg_push_user_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_jsonb(new)->>'notification_log_id' is null then
    perform public._push_enqueue(array[new.user_id], 'consumer', 'JustPlay', new.message, '/notifications');
  end if;
  return new;
exception when others then
  return new;
end;
$$;
drop trigger if exists push_on_user_notification on public.user_notifications;
create trigger push_on_user_notification
  after insert on public.user_notifications
  for each row execute function public.trg_push_user_notification();

-- ── 5. Partner: every partner notification also pushes ──────────────────────
do $$
begin
  if to_regclass('public.partner_notifications') is not null then
    execute $f$
      create or replace function public.trg_push_partner_notification()
      returns trigger language plpgsql security definer set search_path = public as $b$
      begin
        perform public._push_enqueue(array[new.partner_id], 'partner', new.title, new.body,
                                     coalesce(new.link, '/dashboard/notifications'));
        return new;
      exception when others then
        return new;
      end;
      $b$;
    $f$;
    execute 'drop trigger if exists push_on_partner_notification on public.partner_notifications';
    execute 'create trigger push_on_partner_notification after insert on public.partner_notifications
             for each row execute function public.trg_push_partner_notification()';
  end if;
end $$;

-- ── 6. Admin: new support ticket / reply, venue awaiting approval ───────────
do $$
begin
  if to_regclass('public.support_ticket_messages') is not null then
    execute $f$
      create or replace function public.trg_push_support_message()
      returns trigger language plpgsql security definer set search_path = public as $b$
      declare
        t public.support_tickets;
        v_first boolean;
        v_targets uuid[];
      begin
        if new.sender_kind <> 'user' or new.internal then return new; end if;
        select * into t from public.support_tickets where id = new.ticket_id;
        if t.id is null then return new; end if;
        v_first := (select count(*) from public.support_ticket_messages where ticket_id = new.ticket_id) = 1;
        -- A ticket somebody already owns pings just that person.
        v_targets := case when t.assigned_admin_id is not null then array[t.assigned_admin_id]
                          else public._admin_ids() end;
        perform public._push_enqueue(
          v_targets, 'admin',
          case when v_first then 'New support ticket #' || t.ticket_no
               else 'New reply on ticket #' || t.ticket_no end,
          case when v_first then t.subject else left(new.body, 140) end,
          '/support/' || t.id::text
        );
        return new;
      exception when others then
        return new;
      end;
      $b$;
    $f$;
    execute 'drop trigger if exists push_on_support_message on public.support_ticket_messages';
    execute 'create trigger push_on_support_message after insert on public.support_ticket_messages
             for each row execute function public.trg_push_support_message()';
  end if;
end $$;

create or replace function public.trg_push_venue_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.approval_status = 'pending'
     and (tg_op = 'INSERT' or old.approval_status is distinct from 'pending') then
    perform public._push_enqueue(public._admin_ids(), 'admin', 'Venue awaiting approval',
                                 coalesce(new.name, 'A new venue'), '/venues/approvals');
  end if;
  return new;
exception when others then
  return new;
end;
$$;
do $$
begin
  if to_regclass('public.venues') is not null
     and exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'venues' and column_name = 'approval_status') then
    execute 'drop trigger if exists push_on_venue_pending on public.venues';
    execute 'create trigger push_on_venue_pending after insert or update of approval_status on public.venues
             for each row execute function public.trg_push_venue_pending()';
  end if;
end $$;

-- ── 7. Consumer: booking confirmed / cancelled by the venue ─────────────────
create or replace function public.trg_booking_user_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue text;
begin
  if new.user_id is null then return new; end if;
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' and new.source = 'online' then
    select name into v_venue from public.venues where id = new.venue_id;
    insert into public.user_notifications (user_id, message)
    values (new.user_id,
            'Booking confirmed — ' || coalesce(v_venue, 'your venue') || ', ' ||
            to_char(new.date, 'DD Mon') || ', ' || new.time);
  elsif new.status = 'cancelled' and old.status = 'confirmed'
        and coalesce(new.cancellation_reason, '') not in ('user_cancelled', 'payment_failed') then
    select name into v_venue from public.venues where id = new.venue_id;
    insert into public.user_notifications (user_id, message)
    values (new.user_id,
            'Your booking at ' || coalesce(v_venue, 'the venue') || ' on ' ||
            to_char(new.date, 'DD Mon') || ' was cancelled by the venue. Any amount paid will be refunded.');
  end if;
  return new;
exception when others then
  return new;
end;
$$;
drop trigger if exists booking_user_notification on public.bookings;
create trigger booking_user_notification
  after update of status on public.bookings
  for each row execute function public.trg_booking_user_notification();

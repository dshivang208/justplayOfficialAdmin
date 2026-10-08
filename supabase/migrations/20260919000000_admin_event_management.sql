-- ============================================================================
-- JustPlay Admin — create, edit and delete events/tournaments
-- ============================================================================
-- public.events (Consumer's Phase A schema) has always had a public READ
-- policy and an admin READ policy, but no write path anywhere — not a
-- single INSERT/UPDATE/DELETE policy or RPC in any of the three apps'
-- migrations. There was genuinely no way to create an event or tournament
-- short of inserting a row by hand in the SQL editor.
--
-- Mirrors admin_create_coupon / admin_delete_coupon exactly (same
-- is_admin() gate, same security definer + validate + insert/returning
-- shape) — any admin role, not just Super Admin, same as the rest of
-- /content already works.
-- Safe to re-run.
-- ============================================================================

create or replace function public.admin_create_event(
  p_title             text,
  p_description       text,
  p_date              date,
  p_venue_id          uuid,
  p_sport             text,
  p_entry_fee         integer,
  p_fee_unit          text,
  p_participant_limit integer,
  p_kind              text,
  p_time_label        text,
  p_cta_type          text,
  p_image_url         text,
  p_organizer_name    text,
  p_organizer_about   text
)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;

  if p_title is null or char_length(btrim(p_title)) = 0 then raise exception 'TITLE_REQUIRED'; end if;
  if char_length(btrim(p_title)) > 200 then raise exception 'TITLE_TOO_LONG'; end if;
  if p_description is not null and char_length(p_description) > 2000 then raise exception 'DESCRIPTION_TOO_LONG'; end if;
  if p_date is null or p_date < current_date then raise exception 'DATE_MUST_BE_FUTURE'; end if;
  if p_sport is null or char_length(btrim(p_sport)) = 0 then raise exception 'SPORT_REQUIRED'; end if;
  if p_entry_fee is null or p_entry_fee < 0 then raise exception 'INVALID_ENTRY_FEE'; end if;
  if p_participant_limit is null or p_participant_limit <= 0 then raise exception 'INVALID_PARTICIPANT_LIMIT'; end if;
  if p_kind is null or p_kind not in ('Tournament', 'Coaching Camp', 'Meetup') then raise exception 'INVALID_KIND'; end if;
  if p_cta_type is null or p_cta_type not in ('register', 'interest') then raise exception 'INVALID_CTA_TYPE'; end if;

  insert into public.events (
    title, description, date, venue_id, sport, entry_fee, fee_unit,
    participant_limit, kind, time_label, cta_type, image_url, organizer_info
  )
  values (
    btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_date, p_venue_id,
    btrim(p_sport), p_entry_fee, coalesce(nullif(btrim(p_fee_unit), ''), 'entry fee'),
    p_participant_limit, p_kind, nullif(btrim(coalesce(p_time_label, '')), ''), p_cta_type,
    nullif(btrim(coalesce(p_image_url, '')), ''),
    jsonb_build_object(
      'name', coalesce(nullif(btrim(coalesce(p_organizer_name, '')), ''), 'JustPlay'),
      'about', nullif(btrim(coalesce(p_organizer_about, '')), '')
    )
  )
  returning * into v_event;

  return v_event;
end;
$$;

grant execute on function public.admin_create_event(
  text, text, date, uuid, text, integer, text, integer, text, text, text, text, text, text
) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_update_event — same validation as create, minus the future-date
-- check (editing a past event's details, e.g. fixing a typo, should still
-- be possible), plus a friendlier error than the raw DB constraint if
-- someone tries to shrink the cap below people already registered.
-- ----------------------------------------------------------------------------
create or replace function public.admin_update_event(
  p_event_id          uuid,
  p_title             text,
  p_description       text,
  p_date              date,
  p_venue_id          uuid,
  p_sport             text,
  p_entry_fee         integer,
  p_fee_unit          text,
  p_participant_limit integer,
  p_kind              text,
  p_time_label        text,
  p_cta_type          text,
  p_image_url         text,
  p_organizer_name    text,
  p_organizer_about   text
)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event   public.events;
  v_current public.events;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;

  select * into v_current from public.events where id = p_event_id;
  if v_current.id is null then raise exception 'EVENT_NOT_FOUND'; end if;

  if p_title is null or char_length(btrim(p_title)) = 0 then raise exception 'TITLE_REQUIRED'; end if;
  if char_length(btrim(p_title)) > 200 then raise exception 'TITLE_TOO_LONG'; end if;
  if p_description is not null and char_length(p_description) > 2000 then raise exception 'DESCRIPTION_TOO_LONG'; end if;
  if p_date is null then raise exception 'DATE_REQUIRED'; end if;
  if p_sport is null or char_length(btrim(p_sport)) = 0 then raise exception 'SPORT_REQUIRED'; end if;
  if p_entry_fee is null or p_entry_fee < 0 then raise exception 'INVALID_ENTRY_FEE'; end if;
  if p_participant_limit is null or p_participant_limit <= 0 then raise exception 'INVALID_PARTICIPANT_LIMIT'; end if;
  if p_participant_limit < v_current.participant_count then raise exception 'LIMIT_BELOW_CURRENT_REGISTRATIONS'; end if;
  if p_kind is null or p_kind not in ('Tournament', 'Coaching Camp', 'Meetup') then raise exception 'INVALID_KIND'; end if;
  if p_cta_type is null or p_cta_type not in ('register', 'interest') then raise exception 'INVALID_CTA_TYPE'; end if;

  update public.events
  set title = btrim(p_title),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      date = p_date,
      venue_id = p_venue_id,
      sport = btrim(p_sport),
      entry_fee = p_entry_fee,
      fee_unit = coalesce(nullif(btrim(p_fee_unit), ''), 'entry fee'),
      participant_limit = p_participant_limit,
      kind = p_kind,
      time_label = nullif(btrim(coalesce(p_time_label, '')), ''),
      cta_type = p_cta_type,
      image_url = nullif(btrim(coalesce(p_image_url, '')), ''),
      organizer_info = jsonb_build_object(
        'name', coalesce(nullif(btrim(coalesce(p_organizer_name, '')), ''), 'JustPlay'),
        'about', nullif(btrim(coalesce(p_organizer_about, '')), '')
      )
  where id = p_event_id
  returning * into v_event;

  return v_event;
end;
$$;

grant execute on function public.admin_update_event(
  uuid, text, text, date, uuid, text, integer, text, integer, text, text, text, text, text, text
) to authenticated;

create or replace function public.admin_delete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  delete from public.events where id = p_event_id;
end;
$$;

grant execute on function public.admin_delete_event(uuid) to authenticated;
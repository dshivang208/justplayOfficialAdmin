/**
 * Event / tournament management — there was no write path for public.events
 * anywhere (Consumer and Admin could both only read it). See migration
 * 20260919000000_admin_event_management.sql for the RPCs this calls.
 */
import { supabase } from "@/lib/supabaseClient";

export type EventKind = "Tournament" | "Coaching Camp" | "Meetup";
export type EventCtaType = "register" | "interest";

export type AdminEvent = {
  id: string;
  title: string;
  description: string | null;
  date: string;
  venueId: string | null;
  sport: string;
  entryFee: number;
  feeUnit: string;
  participantLimit: number;
  participantCount: number;
  kind: EventKind;
  timeLabel: string | null;
  ctaType: EventCtaType;
  imageUrl: string | null;
  organizerName: string;
  organizerAbout: string | null;
  createdAt: string;
};

export type EventInput = {
  title: string;
  description: string;
  date: string; // "YYYY-MM-DD"
  venueId: string | null;
  sport: string;
  entryFee: number;
  feeUnit: string;
  participantLimit: number;
  kind: EventKind;
  timeLabel: string;
  ctaType: EventCtaType;
  imageUrl: string;
  organizerName: string;
  organizerAbout: string;
};

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  date: string;
  venue_id: string | null;
  sport: string;
  entry_fee: number;
  fee_unit: string;
  participant_limit: number;
  participant_count: number;
  organizer_info: { name?: string; about?: string } | null;
  kind: EventKind;
  time_label: string | null;
  cta_type: EventCtaType;
  image_url: string | null;
  created_at: string;
};

function mapEventRow(row: EventRow): AdminEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    date: row.date,
    venueId: row.venue_id,
    sport: row.sport,
    entryFee: row.entry_fee,
    feeUnit: row.fee_unit,
    participantLimit: row.participant_limit,
    participantCount: row.participant_count,
    kind: row.kind,
    timeLabel: row.time_label,
    ctaType: row.cta_type,
    imageUrl: row.image_url,
    organizerName: row.organizer_info?.name ?? "JustPlay",
    organizerAbout: row.organizer_info?.about ?? null,
    createdAt: row.created_at,
  };
}

const EVENT_ERRORS: Record<string, string> = {
  NOT_ALLOWED: "You don't have permission to manage events.",
  TITLE_REQUIRED: "Give the event a title.",
  TITLE_TOO_LONG: "That title is too long (200 characters max).",
  DESCRIPTION_TOO_LONG: "That description is too long (2000 characters max).",
  DATE_MUST_BE_FUTURE: "Pick a date that hasn't passed yet.",
  DATE_REQUIRED: "Pick a date.",
  SPORT_REQUIRED: "Enter which sport this is for.",
  INVALID_ENTRY_FEE: "Entry fee can't be negative.",
  INVALID_PARTICIPANT_LIMIT: "Set a participant limit of at least 1.",
  LIMIT_BELOW_CURRENT_REGISTRATIONS:
    "That's fewer spots than people already registered — raise the limit or remove registrants first.",
  INVALID_KIND: "Pick a valid event type.",
  INVALID_CTA_TYPE: "Pick a valid registration type.",
  EVENT_NOT_FOUND: "This event no longer exists.",
};

function friendlyError(error: { message: string }): Error {
  return new Error(EVENT_ERRORS[error.message] ?? error.message);
}

export async function listEvents(): Promise<AdminEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, title, description, date, venue_id, sport, entry_fee, fee_unit, participant_limit, participant_count, organizer_info, kind, time_label, cta_type, image_url, created_at",
    )
    .order("date", { ascending: false })
    .returns<EventRow[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapEventRow);
}

function rpcArgs(input: EventInput) {
  return {
    p_title: input.title.trim(),
    p_description: input.description.trim() || null,
    p_date: input.date,
    p_venue_id: input.venueId,
    p_sport: input.sport.trim(),
    p_entry_fee: input.entryFee,
    p_fee_unit: input.feeUnit.trim() || "entry fee",
    p_participant_limit: input.participantLimit,
    p_kind: input.kind,
    p_time_label: input.timeLabel.trim() || null,
    p_cta_type: input.ctaType,
    p_image_url: input.imageUrl.trim() || null,
    p_organizer_name: input.organizerName.trim() || null,
    p_organizer_about: input.organizerAbout.trim() || null,
  };
}

export async function createEvent(input: EventInput): Promise<AdminEvent> {
  const { data, error } = await supabase.rpc("admin_create_event", rpcArgs(input));
  if (error) throw friendlyError(error);
  return mapEventRow(data as EventRow);
}

export async function updateEvent(eventId: string, input: EventInput): Promise<AdminEvent> {
  const { data, error } = await supabase.rpc("admin_update_event", {
    p_event_id: eventId,
    ...rpcArgs(input),
  });
  if (error) throw friendlyError(error);
  return mapEventRow(data as EventRow);
}

export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_delete_event", { p_event_id: eventId });
  if (error) throw friendlyError(error);
}

/**
 * Real Supabase-backed booking queries for Backend Phase C, replacing
 * src/data/bookings.ts (mock).
 *
 * REAL SCHEMA differs from the mock in one important way: `bookingStatus`
 * never had 'no_show'/'disputed' values in the real `bookings.status`
 * check constraint (only pending/confirmed/cancelled/cancelled_refunded/
 * completed) — a no-show or dispute is a SEPARATE, orthogonal concept
 * tracked in `booking_flags`, not a booking lifecycle state. A booking can
 * be 'completed' AND flagged as a no-show at the same time. The real
 * `Booking` type below reflects that: `bookingStatus` is the real enum,
 * `flags` is a separate array (a booking could in principle carry both a
 * no_show and a dispute flag, per booking_flags' own unique constraint).
 *
 * "Edit override" (freely editing a booking's date/time/amount, from the
 * old mock UI) is NOT wired to real data here — the real `date`/`time`
 * columns exist, but they're a display label alongside the ACTUAL
 * reservation, which lives in `slots`/`booking_slots`. Editing just the
 * label would desync it from the real slot hold (the old time slot stays
 * reserved, a new customer could double-book what the UI now shows as
 * free) — a real "move this booking" feature needs to reassign the
 * underlying slot(s), which is out of this phase's brief and not built.
 */
import { supabase } from "@/lib/supabaseClient";

/** Same format the partner app uses (src/data/bookings.ts there) — a
 *  booking referenced in support conversations should look identical
 *  whichever app you're looking at it from. */
export function formatBookingId(id: string) {
  return `JP-${id.replace(/\D/g, "").slice(-6).padStart(6, "0")}`;
}

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled" | "cancelled_refunded";
export type PaymentStatus = "paid" | "pending" | "refunded";
export type FlagType = "no_show" | "dispute";
export type FlagResolution = "unresolved" | "resolved" | "credit_issued" | "no_action";

export type BookingFlag = {
  id: string;
  bookingId: string;
  type: FlagType;
  reason: string | null;
  resolution: FlagResolution;
  resolutionNote: string | null;
  creditAmount: number | null;
  createdAt: string;
};

export type Booking = {
  id: string;
  customerId: string;
  customerName: string;
  venueId: string;
  venueName: string;
  city: string;
  sport: string;
  date: string;
  time: string;
  amount: number;
  paymentStatus: PaymentStatus;
  bookingStatus: BookingStatus;
  cancellationReason: string | null;
  flags: BookingFlag[];
};

/** Flag row enriched with its booking's context — the disputes queue is
 *  flag-centric (a booking could carry two flags), not booking-centric. */
export type EnrichedFlag = BookingFlag & {
  venueName: string;
  customerName: string;
  sport: string;
  date: string;
};

type BookingRow = {
  id: string;
  user_id: string;
  venue_id: string;
  sport: string;
  date: string;
  time: string;
  price_paid: number;
  payment_status: PaymentStatus;
  status: BookingStatus;
  cancellation_reason: string | null;
  users: { name: string } | null;
  venues: { name: string; city: string } | null;
};

type FlagRow = {
  id: string;
  booking_id: string;
  flag_type: FlagType;
  reason: string | null;
  resolution: FlagResolution;
  resolution_note: string | null;
  credit_amount: number | null;
  created_at: string;
};

function mapBookingRow(row: BookingRow, flags: BookingFlag[]): Booking {
  return {
    id: row.id,
    customerId: row.user_id,
    customerName: row.users?.name ?? "Unknown customer",
    venueId: row.venue_id,
    venueName: row.venues?.name ?? "Unknown venue",
    city: row.venues?.city ?? "\u2014",
    sport: row.sport,
    date: row.date,
    time: row.time,
    amount: row.price_paid,
    paymentStatus: row.payment_status,
    bookingStatus: row.status,
    cancellationReason: row.cancellation_reason,
    flags,
  };
}

function mapFlagRow(row: FlagRow): BookingFlag {
  return {
    id: row.id,
    bookingId: row.booking_id,
    type: row.flag_type,
    reason: row.reason,
    resolution: row.resolution,
    resolutionNote: row.resolution_note,
    creditAmount: row.credit_amount,
    createdAt: row.created_at,
  };
}

const BOOKING_SELECT =
  "id, user_id, venue_id, sport, date, time, price_paid, payment_status, status, cancellation_reason, users(name), venues(name, city)";

async function flagsByBookingId(bookingIds: string[]): Promise<Map<string, BookingFlag[]>> {
  if (bookingIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("booking_flags")
    .select("id, booking_id, flag_type, reason, resolution, resolution_note, credit_amount, created_at")
    .in("booking_id", bookingIds)
    .returns<FlagRow[]>();
  if (error) throw new Error(error.message);

  const map = new Map<string, BookingFlag[]>();
  for (const row of data ?? []) {
    const flag = mapFlagRow(row);
    const list = map.get(flag.bookingId) ?? [];
    list.push(flag);
    map.set(flag.bookingId, list);
  }
  return map;
}

/** Platform-wide, across every venue — capped at 500 most recent, same
 *  "no pagination yet" scope as the rest of this admin app's list views. */
export async function listBookings(): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .order("date", { ascending: false })
    .limit(500)
    .returns<BookingRow[]>();
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  const flagMap = await flagsByBookingId(rows.map((r) => r.id));
  return rows.map((row) => mapBookingRow(row, flagMap.get(row.id) ?? []));
}

export async function getBooking(id: string): Promise<Booking | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("id", id)
    .maybeSingle<BookingRow>();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const flagMap = await flagsByBookingId([id]);
  return mapBookingRow(data, flagMap.get(id) ?? []);
}

export async function getBookingsForUser(userId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .returns<BookingRow[]>();
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  const flagMap = await flagsByBookingId(rows.map((r) => r.id));
  return rows.map((row) => mapBookingRow(row, flagMap.get(row.id) ?? []));
}

/** Flag-centric, for the disputes queue — one card per flag, not per
 *  booking, since a booking can carry more than one. */
export async function listBookingFlags(): Promise<EnrichedFlag[]> {
  const { data, error } = await supabase
    .from("booking_flags")
    .select(
      "id, booking_id, flag_type, reason, resolution, resolution_note, credit_amount, created_at, bookings(sport, date, venues(name), users(name))",
    )
    .order("created_at", { ascending: false })
    .returns<(FlagRow & { bookings: { sport: string; date: string; venues: { name: string } | null; users: { name: string } | null } | null })[]>();
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    ...mapFlagRow(row),
    venueName: row.bookings?.venues?.name ?? "Unknown venue",
    customerName: row.bookings?.users?.name ?? "Unknown customer",
    sport: row.bookings?.sport ?? "",
    date: row.bookings?.date ?? "",
  }));
}

// ── Mutations ────────────────────────────────────────────────────────────

type RefundResult = {
  booking: unknown;
  refunded: boolean;
  refundError?: string;
};

/** Cancel only — goes through the same shared cancel_booking RPC every
 *  app uses (via the cancel-booking-refund Edge Function), with no
 *  refund override. If the booking happens to still be inside the free-
 *  cancellation window and was paid online, it auto-refunds exactly like
 *  a normal consumer cancellation would — this isn't a separate path. */
export async function cancelBooking(bookingId: string, reason: string) {
  const { data, error } = await supabase.functions.invoke<RefundResult>("cancel-booking-refund", {
    body: { booking_id: bookingId, reason },
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not cancel this booking.");
  return data;
}

/** Manual refund override — works whether the booking is still active
 *  (cancels it first) or already cancelled (refunds directly), bypasses
 *  the free-cancellation-window rule, and supports a custom partial
 *  amount. Verified server-side as an admin action, not just because this
 *  function was called. */
export async function refundBookingOverride(
  bookingId: string,
  input: { reason: string; refundAmount?: number },
) {
  const { data, error } = await supabase.functions.invoke<RefundResult>("cancel-booking-refund", {
    body: {
      booking_id: bookingId,
      reason: input.reason,
      admin_override: input.refundAmount != null ? { refundAmount: input.refundAmount } : {},
    },
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not process this refund.");
  return data;
}

export async function resolveBookingFlag(
  flagId: string,
  resolution: "resolved" | "credit_issued" | "no_action",
  input?: { note?: string; creditAmount?: number },
) {
  const { data, error } = await supabase.rpc("admin_resolve_booking_flag", {
    p_flag_id: flagId,
    p_resolution: resolution,
    p_resolution_note: input?.note ?? null,
    p_credit_amount: input?.creditAmount ?? null,
  });
  if (error) throw new Error(error.message);
  return data;
}
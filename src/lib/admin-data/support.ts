/**
 * Support tickets — admin side. Players raise tickets in the consumer app;
 * the team answers here. Reads use RLS (admins see everything); writes go
 * through SECURITY DEFINER RPCs from 20261023050000_support_tickets.sql, which
 * also notify the player and keep status/timestamps consistent.
 */
import { supabase } from "@/lib/supabaseClient";

export type TicketStatus = "open" | "in_progress" | "waiting_user" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type TicketCategory =
  | "booking"
  | "payment_refund"
  | "venue"
  | "account"
  | "game_group"
  | "other"
  | "payout"
  | "slots_inventory"
  | "venue_profile"
  | "app_issue";

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  booking: "Booking",
  payment_refund: "Payment / refund",
  venue: "Venue",
  account: "Account",
  game_group: "Game / group",
  other: "Other",
  payout: "Payouts & bank",
  slots_inventory: "Slots & pricing",
  venue_profile: "Venue profile",
  app_issue: "App problem",
};

export type TicketSource = "player" | "partner";

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_user: "Waiting on player",
  resolved: "Resolved",
  closed: "Closed",
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export type SupportTicket = {
  id: string;
  ticketNo: number;
  source: TicketSource;
  /** Player tickets: the player's id. Partner tickets: null. */
  userId: string | null;
  /** Venue for partner tickets. */
  venueId: string | null;
  venueName: string | null;
  /** Who raised it — the player, or the partner (owner/staff) of the venue. */
  userName: string;
  userPhone: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  bookingId: string | null;
  assignedAdminId: string | null;
  createdAt: string;
  lastMessageAt: string;
  lastSenderKind: "user" | "admin";
};

export type SupportMessage = {
  id: string;
  senderKind: "user" | "admin";
  body: string;
  internal: boolean;
  createdAt: string;
};

type TicketRow = {
  id: string;
  ticket_no: number | string;
  user_id: string | null;
  source: TicketSource | null;
  venue_id: string | null;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  booking_id: string | null;
  assigned_admin_id: string | null;
  created_at: string;
  last_message_at: string;
  last_sender_kind: "user" | "admin";
  users: { name: string | null; phone: string | null } | null;
  partner: { owner_name: string | null; phone: string | null } | null;
  venue: { name: string | null } | null;
};

// Partner-support columns (source / partner_id / venue_id) arrive with
// 20261024000000_partner_support.sql; until it's applied we read the player
// columns only so the inbox keeps working.
const BASE_COLS =
  "id, ticket_no, user_id, subject, category, priority, status, booking_id, assigned_admin_id, created_at, last_message_at, last_sender_kind, users:users!support_tickets_user_id_fkey(name, phone)";
const COLS = `${BASE_COLS}, source, venue_id, partner:partners!support_tickets_partner_id_fkey(owner_name, phone), venue:venues!support_tickets_venue_id_fkey(name)`;

async function selectTickets<T>(
  build: (cols: string) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const full = await build(COLS);
  if (!full.error) return full.data ?? [];
  const legacy = await build(BASE_COLS);
  if (legacy.error) throw fail(legacy.error.message);
  return legacy.data ?? [];
}

const toTicket = (r: TicketRow): SupportTicket => ({
  id: r.id,
  ticketNo: Number(r.ticket_no),
  source: r.source ?? "player",
  userId: r.user_id,
  venueId: r.venue_id ?? null,
  venueName: r.venue?.name ?? null,
  userName:
    (r.source ?? "player") === "partner"
      ? r.partner?.owner_name || "Venue partner"
      : r.users?.name || "Unnamed user",
  userPhone: (r.source ?? "player") === "partner" ? (r.partner?.phone ?? "") : (r.users?.phone ?? ""),
  subject: r.subject,
  category: r.category,
  priority: r.priority,
  status: r.status,
  bookingId: r.booking_id,
  assignedAdminId: r.assigned_admin_id,
  createdAt: r.created_at,
  lastMessageAt: r.last_message_at,
  lastSenderKind: r.last_sender_kind,
});

const ERRORS: Record<string, string> = {
  NOT_ALLOWED: "You don't have permission to do that.",
  TICKET_NOT_FOUND: "That ticket no longer exists.",
  MESSAGE_REQUIRED: "Write a message first.",
  MESSAGE_TOO_LONG: "Messages can be up to 2000 characters.",
  INVALID_STATUS: "That status isn't valid.",
  INVALID_PRIORITY: "That priority isn't valid.",
};

function fail(message: string): Error {
  if (/could not find the function|relation .*support_tickets.* does not exist|schema cache/i.test(message)) {
    return new Error(
      "Support tickets aren't set up yet — run 20261023050000_support_tickets.sql in Supabase.",
    );
  }
  const code = Object.keys(ERRORS).find((k) => message.includes(k));
  return new Error(code ? ERRORS[code]! : message || "Something went wrong.");
}

export async function listTickets(): Promise<SupportTicket[]> {
  const rows = await selectTickets<TicketRow>((cols) =>
    supabase
      .from("support_tickets")
      .select(cols)
      .order("last_message_at", { ascending: false })
      .limit(500)
      .returns<TicketRow[]>(),
  );
  return rows.map(toTicket);
}

export async function listTicketsForUser(userId: string): Promise<SupportTicket[]> {
  try {
    const rows = await selectTickets<TicketRow>((cols) =>
      supabase
        .from("support_tickets")
        .select(cols)
        .eq("user_id", userId)
        .order("last_message_at", { ascending: false })
        .limit(50)
        .returns<TicketRow[]>(),
    );
    return rows.map(toTicket);
  } catch (e) {
    // The ticket tables may not be installed yet — the user page must still load.
    console.error("listTicketsForUser failed:", e);
    return [];
  }
}

export async function listTicketsForVenue(venueId: string): Promise<SupportTicket[]> {
  try {
    const rows = await selectTickets<TicketRow>((cols) =>
      supabase
        .from("support_tickets")
        .select(cols)
        .eq("venue_id", venueId)
        .order("last_message_at", { ascending: false })
        .limit(50)
        .returns<TicketRow[]>(),
    );
    return rows.map(toTicket);
  } catch {
    return [];
  }
}

export async function getTicket(
  id: string,
): Promise<{ ticket: SupportTicket; messages: SupportMessage[] } | null> {
  const [rows, m] = await Promise.all([
    selectTickets<TicketRow>((cols) =>
      supabase.from("support_tickets").select(cols).eq("id", id).limit(1).returns<TicketRow[]>(),
    ),
    supabase
      .from("support_ticket_messages")
      .select("id, sender_kind, body, internal, created_at")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
  ]);
  const row = rows[0];
  if (!row) return null;
  return {
    ticket: toTicket(row),
    messages: (m.data ?? []).map((r) => ({
      id: r.id as string,
      senderKind: r.sender_kind as "user" | "admin",
      body: r.body as string,
      internal: Boolean(r.internal),
      createdAt: r.created_at as string,
    })),
  };
}

export async function replyToTicket(
  ticketId: string,
  body: string,
  opts: { internal?: boolean; status?: TicketStatus | null } = {},
): Promise<void> {
  const { error } = await supabase.rpc("admin_reply_support_ticket", {
    p_ticket_id: ticketId,
    p_body: body,
    p_internal: opts.internal ?? false,
    p_status: opts.status ?? null,
  });
  if (error) throw fail(error.message);
}

export async function updateTicket(
  ticketId: string,
  changes: { status?: TicketStatus; priority?: TicketPriority; assign?: boolean },
): Promise<void> {
  const { error } = await supabase.rpc("admin_update_support_ticket", {
    p_ticket_id: ticketId,
    p_status: changes.status ?? null,
    p_priority: changes.priority ?? null,
    p_assign: changes.assign ?? null,
  });
  if (error) throw fail(error.message);
}

export type SupportCounts = {
  open: number;
  inProgress: number;
  waiting: number;
  awaitingReply: number;
  resolved: number;
};

export async function getSupportCounts(): Promise<SupportCounts> {
  const { data, error } = await supabase.rpc("admin_support_counts");
  if (error) throw fail(error.message);
  const r = ((data ?? []) as Record<string, number | string>[])[0] ?? {};
  return {
    open: Number(r["open_count"] ?? 0),
    inProgress: Number(r["in_progress_count"] ?? 0),
    waiting: Number(r["waiting_count"] ?? 0),
    awaitingReply: Number(r["awaiting_reply_count"] ?? 0),
    resolved: Number(r["resolved_count"] ?? 0),
  };
}

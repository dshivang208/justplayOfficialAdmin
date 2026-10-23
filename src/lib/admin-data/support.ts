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
  | "other";

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  booking: "Booking",
  payment_refund: "Payment / refund",
  venue: "Venue",
  account: "Account",
  game_group: "Game / group",
  other: "Other",
};

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
  userId: string;
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
  user_id: string;
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
};

const COLS =
  "id, ticket_no, user_id, subject, category, priority, status, booking_id, assigned_admin_id, created_at, last_message_at, last_sender_kind, users:users!support_tickets_user_id_fkey(name, phone)";

const toTicket = (r: TicketRow): SupportTicket => ({
  id: r.id,
  ticketNo: Number(r.ticket_no),
  userId: r.user_id,
  userName: r.users?.name || "Unnamed user",
  userPhone: r.users?.phone ?? "",
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
  const { data, error } = await supabase
    .from("support_tickets")
    .select(COLS)
    .order("last_message_at", { ascending: false })
    .limit(500)
    .returns<TicketRow[]>();
  if (error) throw fail(error.message);
  return (data ?? []).map(toTicket);
}

export async function listTicketsForUser(userId: string): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from("support_tickets")
    .select(COLS)
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false })
    .limit(50)
    .returns<TicketRow[]>();
  if (error) {
    // The ticket tables may not be installed yet — the user page must still load.
    console.error("listTicketsForUser failed:", error.message);
    return [];
  }
  return (data ?? []).map(toTicket);
}

export async function getTicket(
  id: string,
): Promise<{ ticket: SupportTicket; messages: SupportMessage[] } | null> {
  const [t, m] = await Promise.all([
    supabase.from("support_tickets").select(COLS).eq("id", id).maybeSingle<TicketRow>(),
    supabase
      .from("support_ticket_messages")
      .select("id, sender_kind, body, internal, created_at")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
  ]);
  if (t.error) throw fail(t.error.message);
  if (!t.data) return null;
  return {
    ticket: toTicket(t.data),
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

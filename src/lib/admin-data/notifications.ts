/**
 * Real Supabase-backed notification log queries for Backend Phase E,
 * replacing src/data/notifications.ts (mock).
 *
 * Logs intent only — no real SMS/push delivery, per the brief.
 * "specific_city" was DROPPED as an audience option: public.users has no
 * city column and nothing else ties a user to one, so there's no real
 * data to target by (see the migration's comment on this table).
 */
import { supabase } from "@/lib/supabaseClient";

export type NotificationAudience = "all_users" | "inactive_30_days" | "pending_bookings";

export const audienceLabels: Record<NotificationAudience, string> = {
  all_users: "All users",
  inactive_30_days: "Haven't booked in 30 days",
  pending_bookings: "Have an upcoming booking",
};

export type SentNotification = {
  id: string;
  message: string;
  audience: NotificationAudience;
  sentDate: string;
  recipientCount: number;
};

type LogRow = {
  id: string;
  message: string;
  audience: NotificationAudience;
  recipient_count: number;
  sent_at: string;
};

export async function listSentNotifications(): Promise<SentNotification[]> {
  const { data, error } = await supabase
    .from("notifications_log")
    .select("id, message, audience, recipient_count, sent_at")
    .order("sent_at", { ascending: false })
    .returns<LogRow[]>();
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    message: row.message,
    audience: row.audience,
    sentDate: row.sent_at.slice(0, 10),
    recipientCount: row.recipient_count,
  }));
}

export async function getAudienceCount(audience: NotificationAudience): Promise<number> {
  const { data, error } = await supabase.rpc("admin_notification_audience_count", {
    p_audience: audience,
  });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

export type SendResult = {
  inAppDelivered: number;
  smsSent: number;
  smsFailed: number;
  smsErrors: string[];
  pushSent: number;
  pushFailed: number;
  pushErrors: string[];
};

export async function sendNotification(
  message: string,
  audience: NotificationAudience,
  channels: { inApp: boolean; sms: boolean; push: boolean } = { inApp: true, sms: false, push: false },
): Promise<SentNotification & SendResult> {
  const { data, error } = await supabase.functions.invoke<{
    log: LogRow;
    inAppDelivered: number;
    smsSent: number;
    smsFailed: number;
    smsErrors: string[];
    pushSent: number;
    pushFailed: number;
    pushErrors: string[];
  }>("admin-send-notification", {
    body: { message, audience, channels },
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not send this notification.");

  return {
    id: data.log.id,
    message: data.log.message,
    audience: data.log.audience,
    sentDate: data.log.sent_at.slice(0, 10),
    recipientCount: data.log.recipient_count,
    // Defensive: an older deployed version of admin-send-notification
    // (e.g. from before push support was added) won't include these
    // fields at all — coalescing to safe defaults means a version
    // mismatch between this frontend and whatever's actually deployed
    // degrades gracefully instead of crashing on `.length` of undefined.
    inAppDelivered: data.inAppDelivered ?? 0,
    smsSent: data.smsSent ?? 0,
    smsFailed: data.smsFailed ?? 0,
    smsErrors: data.smsErrors ?? [],
    pushSent: data.pushSent ?? 0,
    pushFailed: data.pushFailed ?? 0,
    pushErrors: data.pushErrors ?? [],
  };
}
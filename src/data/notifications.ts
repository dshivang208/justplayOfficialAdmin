/**
 * Mock data for the Push Notification / Announcement Sender's history.
 * Shapes mirror the future API contract (`GET /admin/notifications`,
 * `POST /admin/notifications`) so swapping this for a real send later is
 * a one-file change.
 */

export type NotificationAudience =
  | "all_users"
  | "specific_city"
  | "inactive_30_days"
  | "pending_bookings";

export const audienceLabels: Record<NotificationAudience, string> = {
  all_users: "All users",
  specific_city: "Users in a specific city",
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

export const sentNotifications: SentNotification[] = [
  {
    id: "ntf-001",
    message: "Monsoon is here! Get 20% off all outdoor turf bookings this week with MONSOON20.",
    audience: "all_users",
    sentDate: "2026-08-20",
    recipientCount: 6214,
  },
  {
    id: "ntf-002",
    message: "We miss you on the court! Here's ₹100 off your next booking — come back and play.",
    audience: "inactive_30_days",
    sentDate: "2026-08-10",
    recipientCount: 842,
  },
  {
    id: "ntf-003",
    message: "Reminder: your Civil Lines Tennis Club slot is tomorrow at 6 AM. See you there!",
    audience: "pending_bookings",
    sentDate: "2026-08-01",
    recipientCount: 96,
  },
];

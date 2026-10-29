// JustPlay Admin — Backend Phase E follow-up: admin-send-notification
//
// Three real delivery channels:
//   - In-app: always, if requested — inserts a user_notifications row per
//     matching user, which the consumer app's own notification bell
//     reads directly (RLS: a user only ever sees their own).
//   - SMS: only when the admin explicitly opts in (channels.sms === true
//     — never a silent default, a real send costs real money). Sends via
//     Twilio's real Messages API, sequentially per recipient.
//   - Push: only when the admin explicitly opts in (channels.push ===
//     true). Real web push through Firebase Cloud Messaging, delivered by the
//     shared `send-push` Edge Function to every browser the recipient has
//     registered (push_tokens, app = 'consumer').
//
// For an audience large enough to threaten the Edge Function's execution
// time limit, sequential per-recipient sends (SMS and push both) need a
// queue/background job instead of one synchronous call — a scale problem
// for later, not something faked here.

import { requireAdmin, json, corsHeaders } from "../_shared/adminAuth.ts";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const PUSH_WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET");

type AudienceUser = { id: string; name: string; phone: string };

async function sendTwilioSms(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const form = new URLSearchParams({ To: to, From: TWILIO_FROM_NUMBER!, Body: body });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
    },
    body: form.toString(),
  });

  if (res.ok) return { ok: true };
  const errorBody = await res.json().catch(() => null);
  return { ok: false, error: errorBody?.message ?? `Twilio returned ${res.status}` };
}

/** Hands a batch of user ids to the shared `send-push` function (FCM). */
async function sendPushBatch(
  userIds: string[],
  message: string,
  image?: string,
): Promise<{ sent: number; failed: number; error?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-push-secret": PUSH_WEBHOOK_SECRET! },
      body: JSON.stringify({ user_ids: userIds, app: "consumer", title: "JustPlay", body: message, url: "/notifications", ...(image ? { image } : {}) }),
    });
    const out = await res.json().catch(() => null);
    if (!res.ok) return { sent: 0, failed: userIds.length, error: out?.error ?? `send-push returned ${res.status}` };
    return { sent: out.sent ?? 0, failed: out.failed ?? 0 };
  } catch (e) {
    return { sent: 0, failed: userIds.length, error: e instanceof Error ? e.message : "Push send failed" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireAdmin(req);
  if ("error" in auth) return json({ error: auth.error }, auth.status);
  const { admin, serviceClient } = auth;

  let body: { message?: unknown; audience?: unknown; channels?: { inApp?: unknown; sms?: unknown; push?: unknown }; imageUrl?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const { message, audience } = body;
  const wantInApp = body.channels?.inApp !== false; // default on
  const wantSms = body.channels?.sms === true; // default off — explicit opt-in only
  const wantPush = body.channels?.push === true; // default off — explicit opt-in only

  if (typeof message !== "string" || message.trim().length === 0) {
    return json({ error: "Message is required." }, 400);
  }
  // The picture must be one an admin uploaded to our own public bucket — never an arbitrary URL.
  let imageUrl: string | undefined;
  if (body.imageUrl !== undefined && body.imageUrl !== null && body.imageUrl !== "") {
    const allowedPrefix = `${SUPABASE_URL}/storage/v1/object/public/notification-images/`;
    if (typeof body.imageUrl !== "string" || !body.imageUrl.startsWith(allowedPrefix) || body.imageUrl.length > 500) {
      return json({ error: "Invalid image. Upload it from the notification form." }, 400);
    }
    imageUrl = body.imageUrl;
  }
  if (typeof audience !== "string" || !["all_users", "inactive_30_days", "pending_bookings"].includes(audience)) {
    return json({ error: "Invalid audience." }, 400);
  }

  const { data: recipients, error: audienceError } = await serviceClient.rpc(
    "admin_notification_audience_users",
    { p_audience: audience },
  );
  if (audienceError) return json({ error: audienceError.message }, 500);

  const users = (recipients ?? []) as AudienceUser[];

  const { data: logRow, error: logError } = await serviceClient
    .from("notifications_log")
    .insert({
      message: message.trim(),
      audience,
      recipient_count: users.length,
      sent_by: admin.id,
      channels: { inApp: wantInApp, sms: wantSms, push: wantPush },
      image_url: imageUrl ?? null,
    })
    .select()
    .maybeSingle();
  if (logError) return json({ error: logError.message }, 500);

  if (wantInApp && users.length > 0) {
    const rows = users.map((u) => ({
      user_id: u.id,
      message: message.trim(),
      notification_log_id: logRow.id,
    }));
    const { error: insertError } = await serviceClient.from("user_notifications").insert(rows);
    if (insertError) console.error("user_notifications bulk insert failed:", insertError.message);
  }

  let smsSent = 0;
  let smsFailed = 0;
  const smsErrors: string[] = [];

  if (wantSms) {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
      smsErrors.push("SMS was requested but Twilio isn't configured (missing account credentials).");
    } else {
      for (const u of users) {
        if (!u.phone) {
          smsFailed++;
          continue;
        }
        const result = await sendTwilioSms(u.phone, message.trim());
        if (result.ok) smsSent++;
        else {
          smsFailed++;
          if (smsErrors.length < 5) smsErrors.push(`${u.phone}: ${result.error}`);
        }
      }
    }
  }

  let pushSent = 0;
  let pushFailed = 0;
  const pushErrors: string[] = [];

  if (wantPush) {
    if (!PUSH_WEBHOOK_SECRET || !SUPABASE_URL) {
      pushErrors.push("Push was requested but isn't configured (missing PUSH_WEBHOOK_SECRET).");
    } else if (users.length > 0) {
      // Chunked so one request never carries an enormous audience.
      const ids = users.map((u) => u.id);
      for (let i = 0; i < ids.length; i += 500) {
        const r = await sendPushBatch(ids.slice(i, i + 500), message.trim(), imageUrl);
        pushSent += r.sent;
        pushFailed += r.failed;
        if (r.error && pushErrors.length < 5) pushErrors.push(r.error);
      }
    }
  }

  const { error: updateError } = await serviceClient
    .from("notifications_log")
    .update({
      sms_sent_count: smsSent,
      sms_failed_count: smsFailed,
      push_sent_count: pushSent,
      push_failed_count: pushFailed,
    })
    .eq("id", logRow.id);
  if (updateError) console.error("notifications_log delivery-count update failed:", updateError.message);

  return json({
    log: { ...logRow, sms_sent_count: smsSent, sms_failed_count: smsFailed, push_sent_count: pushSent, push_failed_count: pushFailed },
    inAppDelivered: wantInApp ? users.length : 0,
    smsSent,
    smsFailed,
    smsErrors,
    pushSent,
    pushFailed,
    pushErrors,
  });
});
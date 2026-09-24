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
//     true). Real Web Push (RFC 8030 + VAPID, RFC 8292) to every browser
//     the recipient has subscribed from (push_subscriptions) — this is
//     genuine OS/browser-level push, not a simulation, but it's the Web
//     Push standard rather than FCM/APNs since there's no native mobile
//     client here to hold a device token.
//
// Uses @pushforge/builder (not the classic `web-push` npm package) — it
// builds the signed+encrypted request using the Web Crypto API, which
// Deno has natively; the classic package leans on Node's `crypto` module
// in ways that don't reliably run on Deno Deploy. This function does the
// actual `fetch()` to the push service itself; the library only builds
// the request.
//
// For an audience large enough to threaten the Edge Function's execution
// time limit, sequential per-recipient sends (SMS and push both) need a
// queue/background job instead of one synchronous call — a scale problem
// for later, not something faked here.

import { requireAdmin, json, corsHeaders } from "../_shared/adminAuth.ts";
import { buildPushHTTPRequest } from "npm:@pushforge/builder@1";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER");

const VAPID_PRIVATE_KEY_JWK = Deno.env.get("VAPID_PRIVATE_KEY"); // JSON string of the JWK
const VAPID_CONTACT_EMAIL = Deno.env.get("VAPID_CONTACT_EMAIL"); // e.g. "mailto:ops@justplay.example"

type AudienceUser = { id: string; name: string; phone: string };
type PushSubscriptionRow = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

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

/** Sends to one browser subscription. Returns "gone" specifically when
 *  the push service reports the subscription no longer exists (410/404)
 *  — the caller deletes that row rather than counting it as a transient
 *  failure that might succeed on retry. */
async function sendWebPush(
  sub: PushSubscriptionRow,
  title: string,
  body: string,
): Promise<{ ok: boolean; gone?: boolean; error?: string }> {
  try {
    const privateJWK = JSON.parse(VAPID_PRIVATE_KEY_JWK!);
    const { endpoint, headers, body: pushBody } = await buildPushHTTPRequest({
      privateJWK,
      message: {
        payload: { title, body, url: "/" },
        options: { ttl: 3600, urgency: "normal" as const },
        adminContact: VAPID_CONTACT_EMAIL!,
      },
      subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    });

    const res = await fetch(endpoint, { method: "POST", headers, body: pushBody });
    if (res.status === 201 || res.ok) return { ok: true };
    if (res.status === 404 || res.status === 410) return { ok: false, gone: true };
    return { ok: false, error: `Push service returned ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Push send failed" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireAdmin(req);
  if ("error" in auth) return json({ error: auth.error }, auth.status);
  const { admin, serviceClient } = auth;

  let body: { message?: unknown; audience?: unknown; channels?: { inApp?: unknown; sms?: unknown; push?: unknown } };
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
    if (!VAPID_PRIVATE_KEY_JWK || !VAPID_CONTACT_EMAIL) {
      pushErrors.push("Push was requested but VAPID isn't configured (missing private key/contact email).");
    } else if (users.length > 0) {
      const { data: subs, error: subsError } = await serviceClient
        .from("push_subscriptions")
        .select("id, user_id, endpoint, p256dh, auth")
        .in(
          "user_id",
          users.map((u) => u.id),
        );
      if (subsError) {
        pushErrors.push(subsError.message);
      } else {
        const goneIds: string[] = [];
        for (const sub of (subs ?? []) as PushSubscriptionRow[]) {
          const result = await sendWebPush(sub, "JustPlay", message.trim());
          if (result.ok) pushSent++;
          else {
            pushFailed++;
            if (result.gone) goneIds.push(sub.id);
            else if (pushErrors.length < 5) pushErrors.push(result.error ?? "Unknown push error");
          }
        }
        if (goneIds.length > 0) {
          // The push service itself says these subscriptions no longer
          // exist (browser uninstalled, permission revoked, etc) — clean
          // them up so future sends don't keep retrying dead endpoints.
          const { error: cleanupError } = await serviceClient
            .from("push_subscriptions")
            .delete()
            .in("id", goneIds);
          if (cleanupError) console.error("push_subscriptions cleanup failed:", cleanupError.message);
        }
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
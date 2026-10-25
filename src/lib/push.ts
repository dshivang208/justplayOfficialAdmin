/**
 * Web push through Firebase Cloud Messaging (FCM) — the browser side.
 *
 * Flow: ask permission -> register our service worker -> getToken() gives an
 * FCM registration token -> save it with the register_push_token RPC. The
 * server (send-push Edge Function) then pushes to that token whenever a row
 * lands in this user's notification feed.
 *
 * Needs these build-time env vars (Firebase console -> Project settings):
 *   VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID,
 *   VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID,
 *   VITE_FIREBASE_VAPID_KEY  (Cloud Messaging -> Web Push certificates -> key pair)
 */
import { supabase } from "@/lib/supabaseClient";

export type PushApp = "consumer" | "partner" | "admin";
export type PushState = "unsupported" | "unconfigured" | "denied" | "enabled" | "default";

const env = import.meta.env as Record<string, string | undefined>;
const firebaseConfig = {
  apiKey: env["VITE_FIREBASE_API_KEY"] ?? "",
  projectId: env["VITE_FIREBASE_PROJECT_ID"] ?? "",
  messagingSenderId: env["VITE_FIREBASE_MESSAGING_SENDER_ID"] ?? "",
  appId: env["VITE_FIREBASE_APP_ID"] ?? "",
};
const WEB_PUSH_KEY = env["VITE_FIREBASE_VAPID_KEY"] ?? "";
const TOKEN_KEY = "jp_fcm_token";

export const pushConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId &&
    WEB_PUSH_KEY,
);

export function pushUnsupportedReason(): string | null {
  if (typeof window === "undefined") return "Push isn't available here.";
  if (!window.isSecureContext) return "Push notifications need HTTPS.";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent)
      ? "On iPhone, add JustPlay to your Home Screen first, then enable notifications."
      : "This browser doesn't support push notifications.";
  }
  return null;
}

export function currentPushState(): PushState {
  if (pushUnsupportedReason()) return "unsupported";
  if (!pushConfigured) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "granted" && storedToken()) return "enabled";
  return "default";
}

function storedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function storeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode — token still lives server-side */
  }
}

async function getMessagingInstance() {
  const [{ initializeApp, getApps, getApp }, { getMessaging, isSupported }] = await Promise.all([
    import("firebase/app"),
    import("firebase/messaging"),
  ]);
  if (!(await isSupported())) return null;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getMessaging(app);
}

async function registerWorker(): Promise<ServiceWorkerRegistration> {
  // The worker can't read Vite env, so the (public) config rides in the URL.
  const qs = new URLSearchParams({
    apiKey: firebaseConfig.apiKey,
    projectId: firebaseConfig.projectId,
    messagingSenderId: firebaseConfig.messagingSenderId,
    appId: firebaseConfig.appId,
  });
  const reg = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${qs.toString()}`, { scope: "/" });
  await navigator.serviceWorker.ready;
  return reg;
}

async function fetchToken(): Promise<string> {
  const messaging = await getMessagingInstance();
  if (!messaging) throw new Error("This browser doesn't support push notifications.");
  const { getToken } = await import("firebase/messaging");
  const token = await getToken(messaging, {
    vapidKey: WEB_PUSH_KEY,
    serviceWorkerRegistration: await registerWorker(),
  });
  if (!token) throw new Error("Couldn't get a notification token. Try again.");
  return token;
}

async function saveToken(app: PushApp, token: string) {
  const { error } = await supabase.rpc("register_push_token", {
    p_token: token,
    p_app: app,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw new Error(error.message);
  storeToken(token);
}

/** User tapped "Enable notifications". Throws a human-readable Error on failure. */
export async function enablePush(app: PushApp): Promise<void> {
  const reason = pushUnsupportedReason();
  if (reason) throw new Error(reason);
  if (!pushConfigured) throw new Error("Push isn't configured on this deployment yet.");

  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission === "denied") {
    throw new Error("Notifications are blocked for this site — allow them in your browser's site settings.");
  }
  if (permission !== "granted") throw new Error("Notification permission wasn't granted.");

  await saveToken(app, await fetchToken());
}

/**
 * Silent top-up, called after sign-in: if the user already allowed
 * notifications, make sure this browser's current token belongs to the
 * signed-in account (FCM rotates tokens; shared browsers change owner).
 */
export async function refreshPushToken(app: PushApp): Promise<void> {
  if (pushUnsupportedReason() || !pushConfigured) return;
  if (Notification.permission !== "granted") return;
  try {
    await saveToken(app, await fetchToken());
  } catch (e) {
    console.error("push token refresh failed:", e instanceof Error ? e.message : e);
  }
}

/** Turn push off for this browser (keeps the browser permission). */
export async function disablePush(): Promise<void> {
  const token = storedToken();
  if (token) {
    const { error } = await supabase.rpc("unregister_push_token", { p_token: token });
    if (error) console.error("unregister_push_token failed:", error.message);
  }
  try {
    const messaging = await getMessagingInstance();
    if (messaging) {
      const { deleteToken } = await import("firebase/messaging");
      await deleteToken(messaging);
    }
  } catch (e) {
    console.error("deleteToken failed:", e instanceof Error ? e.message : e);
  }
  storeToken(null);
}

/**
 * Call right BEFORE signing out: detaches this browser from the account so
 * the next person on a shared device doesn't receive the previous user's
 * pushes. The browser permission stays; signing back in re-attaches.
 */
export async function detachPushFromAccount(): Promise<void> {
  const token = storedToken();
  if (!token) return;
  try {
    await supabase.rpc("unregister_push_token", { p_token: token });
  } catch {
    /* best effort — signing out must never be blocked by this */
  }
  storeToken(null);
}

export type ForegroundPush = { title: string; body: string; url: string; tag: string };

/** Messages that arrive while a tab of the app is open and focused. Returns an unsubscribe. */
export async function onForegroundPush(handler: (m: ForegroundPush) => void): Promise<() => void> {
  if (pushUnsupportedReason() || !pushConfigured) return () => undefined;
  const messaging = await getMessagingInstance();
  if (!messaging) return () => undefined;
  const { onMessage } = await import("firebase/messaging");
  return onMessage(messaging, (payload) => {
    const d = payload.data ?? {};
    handler({
      title: d["title"] || payload.notification?.title || "JustPlay",
      body: d["body"] || payload.notification?.body || "",
      url: d["url"] || "/",
      tag: d["tag"] || "",
    });
  });
}

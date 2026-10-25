/* JustPlay — FCM service worker.
 *
 * Wakes when a push arrives (even with every tab closed), shows the
 * notification, and routes a tap back into the app. The Firebase config
 * arrives in the registration URL's query string (see src/lib/push.ts);
 * the SDK files below are vendored from the npm `firebase` package so the
 * worker has no runtime CDN dependency. Messages are data-only, so we build
 * the notification ourselves.
 */
importScripts("/firebase-vendor/firebase-app-compat.js", "/firebase-vendor/firebase-messaging-compat.js");

// Take over from an older worker immediately instead of waiting for every tab to close.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const params = new URL(self.location.href).searchParams;
firebase.initializeApp({
  apiKey: params.get("apiKey"),
  projectId: params.get("projectId"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
});
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  const options = {
    body: d.body || "",
    icon: self.location.origin + "/icons/notification-icon-192.png", // JustPlay logo, shown large beside the text
    badge: self.location.origin + "/icons/notification-badge-96.png", // small monochrome mark in the Android status bar
    vibrate: [120, 60, 120],
    timestamp: Date.now(),
    tag: d.tag || undefined,
    renotify: Boolean(d.tag),
    data: { url: d.url || "/" },
    actions: [{ action: "open", title: "View" }],
  };
  if (d.image) options.image = d.image; // optional banner (Zomato-style rich card)
  return self.registration.showNotification(d.title || "JustPlay", options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || "/";
  const target = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin) {
          await w.focus();
          if ("navigate" in w) return w.navigate(target);
          return;
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

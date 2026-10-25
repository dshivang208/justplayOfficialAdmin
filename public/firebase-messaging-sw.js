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
  return self.registration.showNotification(d.title || "JustPlay", {
    body: d.body || "",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: d.tag || undefined,
    data: { url: d.url || "/" },
  });
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

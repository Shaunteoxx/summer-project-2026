// Push only: no caching, and no fetch interception. Served unbundled from
// public/, so plain JS with no imports.

// Activate straight away. A waiting worker on an installed app can sit behind
// an open window for days, and this one controls nothing worth protecting.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  // Always show something. Safari revokes the subscription of a site that
  // receives a push without showing a notification.
  event.waitUntil(
    self.registration.showNotification(payload.title || "Broke No More", {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      tag: payload.tag || "bnm",
      data: { url: payload.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        await existing.focus();
        if (existing.url === target) return;
        // navigate() rejects on a window this worker doesn't control yet.
        try {
          await existing.navigate(target);
          return;
        } catch {
          // fall through to a fresh window
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});

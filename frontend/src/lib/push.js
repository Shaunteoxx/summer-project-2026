export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      // Skip the HTTP cache so a changed sw.js ships on the next open, not a
      // day later.
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((err) => console.warn("Service worker registration failed", err));
  });
}

export const pushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  // iPadOS reports itself as a Mac; touch support gives it away.
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;

export const detectedTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
};

/** base64url VAPID key -> the raw bytes `applicationServerKey` expects. */
export function urlBase64ToUint8Array(base64) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** The browser's current push subscription, or null. Never throws. */
export async function currentSubscription() {
  if (!pushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    return (await registration?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

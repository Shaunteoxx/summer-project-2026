import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchPushKey,
  fetchPushSubscription,
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
  updateProfile,
} from "@/api/endpoints";
import {
  currentSubscription,
  detectedTimeZone,
  isIos,
  isStandalone,
  pushSupported,
  urlBase64ToUint8Array,
} from "@/lib/push";

export const NOTIFICATION_TYPES = ["morningBudget", "dailyReminder"];
const NONE_ON = { morningBudget: false, dailyReminder: false };

// subscribe() never settles in a browser that can't reach its push service
// (headless Chrome is one). A first registration on a new profile can still
// take several seconds, so this is generous.
const SUBSCRIBE_TIMEOUT_MS = 30_000;

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Push subscription timed out")), ms)
    ),
  ]);

/**
 * Notifications on this device. Choices are per device, so the phone and the
 * laptop can differ.
 *
 * status:
 *   "loading"      still asking the server whether push is configured
 *   "hidden"       nothing to offer: no server keys, a demo account, or a
 *                  browser without push
 *   "ios-install"  iPhone/iPad in a Safari tab; push exists only once the app
 *                  is added to the Home Screen
 *   "blocked"      the user denied notifications for this site
 *   "ready"        `types` says which notifications this device gets
 */
export function usePushNotifications(user, refresh) {
  const keyRef = useRef(undefined);
  const [keyLoaded, setKeyLoaded] = useState(false);
  const [types, setTypes] = useState(NONE_ON);
  const [permission, setPermission] = useState(() =>
    typeof Notification === "undefined" ? "default" : Notification.permission
  );
  const [busy, setBusy] = useState(false);

  // Fetched up front, not on tap: Safari only shows the permission prompt if
  // it's requested before anything else awaits inside the tap.
  useEffect(() => {
    let cancelled = false;
    fetchPushKey()
      .then(({ publicKey }) => {
        keyRef.current = publicKey;
      })
      .catch(() => {
        keyRef.current = null;
      })
      .finally(() => !cancelled && setKeyLoaded(true));
    currentSubscription()
      .then((sub) => sub && fetchPushSubscription(sub.endpoint))
      .then((known) => !cancelled && known && setTypes(known.types))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  let status;
  if (!keyLoaded) status = "loading";
  else if (!keyRef.current || user?.isDemo) status = "hidden";
  // Before the support check: in a Safari tab the push APIs are undefined,
  // and this is exactly the reader who needs to be told how to get them.
  else if (isIos() && !isStandalone()) status = "ios-install";
  else if (!pushSupported()) status = "hidden";
  else if (permission === "denied") status = "blocked";
  else status = "ready";

  const setType = useCallback(
    async (type, on) => {
      const next = { ...types, [type]: on };
      const anyOn = Object.values(next).some(Boolean);

      if (!on) {
        setBusy(true);
        try {
          const sub = await currentSubscription();
          if (sub && !anyOn) {
            // Server first: a browser subscription nobody sends to is harmless;
            // a server row still sending to a switched-off device is not.
            await removePushSubscription({ endpoint: sub.endpoint });
            await sub.unsubscribe().catch(() => {});
          } else if (sub) {
            await savePushSubscription({ ...sub.toJSON(), types: next });
          }
          setTypes(next);
          return { ok: true };
        } finally {
          setBusy(false);
        }
      }

      // Must be the first thing the tap does; see the key prefetch above.
      const permissionRequest = Notification.requestPermission();
      setBusy(true);
      try {
        const result = await permissionRequest;
        setPermission(result);
        if (result !== "granted") return { ok: false, reason: result };

        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        const sub =
          existing ??
          (await withTimeout(
            registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(keyRef.current),
            }),
            SUBSCRIBE_TIMEOUT_MS
          ));

        // Only fill in a zone the account doesn't have yet; a chosen one stays.
        const timezone = user?.timezone ? undefined : detectedTimeZone() || undefined;
        try {
          await savePushSubscription({ ...sub.toJSON(), types: next, timezone });
        } catch (err) {
          // Don't leave a live subscription the server has never heard of.
          if (!existing) await sub.unsubscribe().catch(() => {});
          throw err;
        }
        setTypes(next);
        if (timezone) await refresh();
        return { ok: true };
      } finally {
        setBusy(false);
      }
    },
    [types, user?.timezone, refresh]
  );

  const sendTest = useCallback(async () => {
    setBusy(true);
    try {
      return await sendTestPush();
    } finally {
      setBusy(false);
    }
  }, []);

  const setTimeZone = useCallback(
    async (timezone) => {
      setBusy(true);
      try {
        await updateProfile({ timezone });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  return { status, busy, types, setType, sendTest, setTimeZone };
}

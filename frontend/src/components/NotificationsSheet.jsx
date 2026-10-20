import { Share, SquarePlus } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import SwitchRow from "@/components/SwitchRow";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { detectedTimeZone } from "@/lib/push";

function formatHour(hour) {
  const h = hour % 12 || 12;
  return `${h}${hour < 12 ? "am" : "pm"}`;
}

export const DEFAULT_HOURS = { morningBudget: 8, dailyReminder: 21 };

export function notificationsMeta({ status, types }, hours) {
  if (status === "ios-install") return "Add to Home Screen to turn on";
  if (status === "blocked") return "Blocked in browser settings";
  if (types.morningBudget && types.dailyReminder) return "Morning and evening";
  if (types.morningBudget) return `Morning · ${formatHour(hours.morningBudget)}`;
  if (types.dailyReminder) return `Evening · ${formatHour(hours.dailyReminder)}`;
  return "Off";
}

const TIME_ZONES = (() => {
  try {
    return Intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
})();

/**
 * Notifications for this device. On an iPhone in a Safari tab it explains the
 * Home Screen step instead, because push doesn't exist until then.
 */
export default function NotificationsSheet({ open, onClose, notifications, user, toast }) {
  const { status, busy, types } = notifications;
  const hours = { ...DEFAULT_HOURS, ...user?.notificationHours };
  const saved = user?.timezone || "";
  const detected = detectedTimeZone();
  const zones = saved && !TIME_ZONES.includes(saved) ? [saved, ...TIME_ZONES] : TIME_ZONES;
  const anyOn = types.morningBudget || types.dailyReminder;

  const OPTIONS = [
    {
      type: "morningBudget",
      label: `Morning Budget · ${formatHour(hours.morningBudget)}`,
      description: "What you can spend today, first thing.",
      turnedOn: (when) => `Morning budget on. The first arrives ${when} at ${formatHour(hours.morningBudget)}.`,
    },
    {
      type: "dailyReminder",
      label: `Evening Reminder · ${formatHour(hours.dailyReminder)}`,
      description: "Only on days you haven't logged anything.",
      turnedOn: (when) =>
        `Evening reminder on. The first can come ${when === "today" ? "tonight" : when} at ${formatHour(hours.dailyReminder)}.`,
    },
  ];

  const toggle = ({ type, turnedOn }, on) => {
    // Called straight from the tap, so the permission prompt is allowed.
    notifications
      .setType(type, on)
      .then((result) => {
        if (!on) return;
        if (result.ok) {
          // Turned on after its hour, the first one is tomorrow's, and silence
          // until then would otherwise look like a fault.
          const when = new Date().getHours() < hours[type] ? "today" : "tomorrow";
          toast.success(turnedOn(when));
        } else if (result.reason === "denied") {
          toast.error("Notifications are blocked for this app.");
        }
      })
      .catch(() => toast.error(`Couldn't turn that ${on ? "on" : "off"}. Try again.`));
  };

  const test = () =>
    notifications
      .sendTest()
      .then(({ sent }) =>
        sent
          ? toast.success("Test sent. It should arrive in a few seconds.")
          : toast.error("No devices to send to. Turn a notification off and on again.")
      )
      .catch(() => toast.error("Couldn't send a test. Try again."));

  const changeZone = (zone) =>
    notifications.setTimeZone(zone).catch(() => toast.error("Couldn't update your time zone."));

  return (
    <BottomSheet open={open} onClose={onClose} title="Notifications">
      {status === "ios-install" ? (
        <div className="space-y-4">
          <p className="text-[14px] leading-relaxed text-ink-2">
            iPhone only sends notifications to apps on your Home Screen. Add Broke
            No More there, open it from the new icon, and turn these on from More.
          </p>
          <ol className="space-y-2.5 text-[14px] text-ink-2">
            <li className="flex items-center gap-3">
              <StepNumber n={1} />
              <span className="flex items-center gap-1.5">
                Tap <Share className="h-4 w-4" aria-label="Share" /> in Safari
              </span>
            </li>
            <li className="flex items-center gap-3">
              <StepNumber n={2} />
              <span className="flex items-center gap-1.5">
                Choose <SquarePlus className="h-4 w-4" aria-hidden="true" /> Add to Home Screen
              </span>
            </li>
            <li className="flex items-center gap-3">
              <StepNumber n={3} />
              <span>Open the app from your Home Screen and sign in</span>
            </li>
          </ol>
        </div>
      ) : (
        <div className="space-y-3">
          {status === "blocked" && (
            <p className="text-[13px] leading-relaxed text-ink-3">
              Notifications are blocked for this app. Allow them in your browser or
              system settings, then reopen this page.
            </p>
          )}
          {OPTIONS.map((option) => (
            <SwitchRow
              key={option.type}
              checked={types[option.type]}
              onChange={(on) => toggle(option, on)}
              disabled={busy || status === "blocked"}
              label={option.label}
              description={option.description}
            />
          ))}

          {anyOn && (
            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="notifications-zone">Time Zone</Label>
                {zones.length ? (
                  <select
                    id="notifications-zone"
                    value={saved}
                    disabled={busy}
                    onChange={(e) => changeZone(e.target.value)}
                    className="flex h-[46px] w-full rounded-md border border-hairline-strong bg-surface px-3 text-base text-ink focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink disabled:opacity-40"
                  >
                    {zones.map((zone) => (
                      <option key={zone} value={zone}>
                        {zone.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p id="notifications-zone" className="text-[14px] text-ink-2">
                    {saved.replace(/_/g, " ")}
                  </p>
                )}
                {detected && saved && detected !== saved && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => changeZone(detected)}
                    className="text-[13px] font-medium text-ink-2 underline underline-offset-2"
                  >
                    This device is on {detected.replace(/_/g, " ")}. Use that instead
                  </button>
                )}
              </div>
              <Button variant="outline" className="w-full" onClick={test} disabled={busy}>
                Send a Test Notification
              </Button>
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

function StepNumber({ n }) {
  return (
    <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-ink">
      {n}
    </span>
  );
}

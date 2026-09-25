// Vibration can be switched off per device, and once it is, nothing in the app
// may buzz — every call site goes through haptic(), so this is the one guard.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { haptic, hapticsEnabled, setHapticsEnabled } from "@/lib/haptics";

const vibrate = vi.fn();

beforeEach(() => {
  Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
  vibrate.mockReset();
});
afterEach(() => {
  delete navigator.vibrate;
});

describe("haptic", () => {
  it("is on until a device says otherwise", () => {
    expect(hapticsEnabled()).toBe(true);
    haptic();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("stays silent once switched off, and remembers it", () => {
    setHapticsEnabled(false);
    expect(hapticsEnabled()).toBe(false);
    haptic("success");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("comes back when switched on again", () => {
    setHapticsEnabled(false);
    setHapticsEnabled(true);
    haptic();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
});

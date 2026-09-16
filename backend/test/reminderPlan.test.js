// Who gets the "nothing logged today" reminder, and when. Everything here is
// pure: the instants are fixed, so each case pins a real UTC moment to the
// wall clock it should read as in the user's zone.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isValidTimeZone, localWallClock } from "../lib/localTime.js";
import { planReminders, withoutLogged } from "../jobs/reminderPlan.js";

const at = (iso) => new Date(iso);
const user = (overrides = {}) => ({
  id: "u1",
  timezone: "Asia/Singapore",
  hour: 21,
  lastSentKey: null,
  ...overrides,
});

describe("localWallClock", () => {
  it("reads UTC and a fixed-offset zone", () => {
    assert.deepEqual(localWallClock(at("2026-09-16T13:00:00Z"), "UTC"), {
      dayKey: "2026-09-16",
      hour: 13,
    });
    assert.deepEqual(localWallClock(at("2026-09-16T13:00:00Z"), "Asia/Singapore"), {
      dayKey: "2026-09-16",
      hour: 21,
    });
  });

  it("rolls the day key over at local midnight, reporting hour 0 not 24", () => {
    assert.deepEqual(localWallClock(at("2026-09-16T16:00:00Z"), "Asia/Singapore"), {
      dayKey: "2026-09-17",
      hour: 0,
    });
  });

  it("follows daylight saving without a date library", () => {
    // 02:00Z is 21:00 in New York in winter (UTC-5) but 22:00 in summer (UTC-4).
    assert.equal(localWallClock(at("2026-01-15T02:00:00Z"), "America/New_York").hour, 21);
    assert.equal(localWallClock(at("2026-07-15T02:00:00Z"), "America/New_York").hour, 22);
    assert.deepEqual(localWallClock(at("2026-07-15T01:00:00Z"), "America/New_York"), {
      dayKey: "2026-07-14",
      hour: 21,
    });
  });

  it("puts half-hour zones in the hour they are partway through", () => {
    // Kolkata is UTC+5:30, so an on-the-hour UTC tick lands at :30 local.
    assert.equal(localWallClock(at("2026-09-16T15:00:00Z"), "Asia/Kolkata").hour, 20);
    assert.equal(localWallClock(at("2026-09-16T16:00:00Z"), "Asia/Kolkata").hour, 21);
  });

  it("returns null for a zone the runtime doesn't know", () => {
    assert.equal(localWallClock(at("2026-09-16T13:00:00Z"), "Not/AZone"), null);
    assert.equal(localWallClock(at("2026-09-16T13:00:00Z"), ""), null);
    assert.equal(isValidTimeZone("Not/AZone"), false);
    assert.equal(isValidTimeZone("Asia/Singapore"), true);
    assert.equal(isValidTimeZone(42), false);
  });
});

describe("planReminders", () => {
  it("is due at the user's local hour and skipped at any other", () => {
    assert.deepEqual(planReminders([user()], at("2026-09-16T13:00:00Z")), {
      due: [{ id: "u1", dayKey: "2026-09-16" }],
      skipped: [],
    });
    assert.deepEqual(planReminders([user()], at("2026-09-16T12:00:00Z")), {
      due: [],
      skipped: [{ id: "u1", reason: "wrong-hour" }],
    });
  });

  it("honours a per-user hour", () => {
    const { due } = planReminders([user({ hour: 9 })], at("2026-09-16T01:00:00Z"));
    assert.deepEqual(due, [{ id: "u1", dayKey: "2026-09-16" }]);
  });

  it("skips a user already reminded on their local day", () => {
    const { due, skipped } = planReminders(
      [user({ lastSentKey: "2026-09-16" })],
      at("2026-09-16T13:00:00Z")
    );
    assert.deepEqual(due, []);
    assert.deepEqual(skipped, [{ id: "u1", reason: "already-sent" }]);
  });

  it("fires once when a DST fall-back repeats the hour", () => {
    // 1 Nov 2026 in New York: 01:00 EDT (05:00Z) then 01:00 EST (06:00Z).
    const first = planReminders(
      [user({ timezone: "America/New_York", hour: 1 })],
      at("2026-11-01T05:00:00Z")
    );
    assert.deepEqual(first.due, [{ id: "u1", dayKey: "2026-11-01" }]);

    const second = planReminders(
      [user({ timezone: "America/New_York", hour: 1, lastSentKey: "2026-11-01" })],
      at("2026-11-01T06:00:00Z")
    );
    assert.deepEqual(second.skipped, [{ id: "u1", reason: "already-sent" }]);
  });

  it("gives users either side of midnight their own day keys", () => {
    // 12:00Z is 02:00 on the 17th in Kiritimati (UTC+14) and 05:00 on the
    // 16th in Los Angeles (UTC-7).
    const { due } = planReminders(
      [
        user({ id: "east", timezone: "Pacific/Kiritimati", hour: 2 }),
        user({ id: "west", timezone: "America/Los_Angeles", hour: 5 }),
      ],
      at("2026-09-16T12:00:00Z")
    );
    assert.deepEqual(due, [
      { id: "east", dayKey: "2026-09-17" },
      { id: "west", dayKey: "2026-09-16" },
    ]);
  });

  it("skips a bad zone without affecting anyone else", () => {
    const { due, skipped } = planReminders(
      [user({ id: "bad", timezone: "Mars/Olympus" }), user({ id: "good" })],
      at("2026-09-16T13:00:00Z")
    );
    assert.deepEqual(due, [{ id: "good", dayKey: "2026-09-16" }]);
    assert.deepEqual(skipped, [{ id: "bad", reason: "invalid-timezone" }]);
  });
});

describe("withoutLogged", () => {
  it("drops users who have logged, by string id", () => {
    const due = [
      { id: "a", dayKey: "2026-09-16" },
      { id: "b", dayKey: "2026-09-16" },
    ];
    assert.deepEqual(withoutLogged(due, new Set(["b"])), [{ id: "a", dayKey: "2026-09-16" }]);
  });
});

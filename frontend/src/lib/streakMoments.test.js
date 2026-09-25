// A rise in the streak is celebrated once, on the first look of the day that
// has one. Every other look — the first ever, a second visit the same day, a
// fall, another account's record on a shared phone — has to stay quiet, or the
// celebration turns into noise.
import { describe, it, expect } from "vitest";

import { streakMoment } from "@/lib/streakMoments";

const KEY = "bnm_streak_seen";
const seen = (record) => localStorage.setItem(KEY, JSON.stringify({ user: null, ...record }));
const recorded = () => JSON.parse(localStorage.getItem(KEY));

describe("streakMoment", () => {
  it("says nothing the first time a device sees the streak, and remembers it", () => {
    expect(streakMoment({ currentStreak: 5, longestStreak: 9 }, "2026-09-15")).toBeNull();
    expect(recorded()).toEqual({ user: null, day: "2026-09-15", streak: 5, best: 9 });
  });

  it("marks a rise since yesterday, from yesterday's figure", () => {
    seen({ day: "2026-09-14", streak: 4, best: 9 });
    expect(streakMoment({ currentStreak: 6, longestStreak: 9 }, "2026-09-15")).toEqual({
      from: 4,
      upgraded: true,
      newBest: false,
    });
  });

  it("marks it once — a second look the same day is quiet", () => {
    seen({ day: "2026-09-14", streak: 4, best: 9 });
    streakMoment({ currentStreak: 5, longestStreak: 9 }, "2026-09-15");
    expect(streakMoment({ currentStreak: 5, longestStreak: 9 }, "2026-09-15")).toBeNull();
  });

  it("doesn't celebrate a rise within the day, which is an edit or a restore", () => {
    seen({ day: "2026-09-15", streak: 4, best: 9 });
    expect(streakMoment({ currentStreak: 5, longestStreak: 9 }, "2026-09-15")).toBeNull();
  });

  it("doesn't celebrate a streak that fell or held", () => {
    seen({ day: "2026-09-14", streak: 4, best: 9 });
    expect(streakMoment({ currentStreak: 0, longestStreak: 9 }, "2026-09-15")).toBeNull();
    seen({ day: "2026-09-14", streak: 4, best: 9 });
    expect(streakMoment({ currentStreak: 4, longestStreak: 9 }, "2026-09-15")).toBeNull();
  });

  it("marks a new badge every five days, and only then", () => {
    seen({ day: "2026-09-14", streak: 9, best: 20 });
    expect(streakMoment({ currentStreak: 10, longestStreak: 20 }, "2026-09-15").upgraded).toBe(true);
    seen({ day: "2026-09-14", streak: 10, best: 20 });
    expect(streakMoment({ currentStreak: 11, longestStreak: 20 }, "2026-09-15").upgraded).toBe(false);
  });

  it("counts a jump past a badge after days away", () => {
    // 8 → 16 goes Bronze to Gold, skipping Silver.
    seen({ day: "2026-09-08", streak: 8, best: 20 });
    expect(streakMoment({ currentStreak: 16, longestStreak: 20 }, "2026-09-15").upgraded).toBe(true);
  });

  it("calls a new best only when it beats one that existed", () => {
    seen({ day: "2026-09-14", streak: 9, best: 9 });
    expect(streakMoment({ currentStreak: 10, longestStreak: 10 }, "2026-09-15").newBest).toBe(true);
    seen({ day: "2026-09-14", streak: 0, best: 0 });
    expect(streakMoment({ currentStreak: 1, longestStreak: 1 }, "2026-09-15").newBest).toBe(false);
  });

  it("ignores a record another account left on this device", () => {
    localStorage.setItem(KEY, JSON.stringify({ user: "someone-else", day: "2026-09-14", streak: 1, best: 1 }));
    expect(streakMoment({ currentStreak: 5, longestStreak: 9 }, "2026-09-15")).toBeNull();
  });
});

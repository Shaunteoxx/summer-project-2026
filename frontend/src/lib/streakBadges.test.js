// Every five days on budget earns the next badge, and the ladder never runs
// out: past the last name, the top badge keeps levelling up.
import { describe, it, expect } from "vitest";

import { badgeAt, badgeFor, nextBadge, progressToNext, tierFor } from "@/lib/streakBadges";

describe("streak badges", () => {
  it("earns nothing before five days, then one every five", () => {
    expect(badgeFor(4)).toBeNull();
    expect(badgeFor(5).label).toBe("Bronze");
    expect(badgeFor(9).label).toBe("Bronze");
    expect(badgeFor(10).label).toBe("Silver");
    expect(badgeFor(35).label).toBe("Diamond");
  });

  it("keeps upgrading past the ladder by level", () => {
    expect(badgeFor(40)).toMatchObject({ key: "diamond", level: 2, label: "Diamond 2" });
    expect(badgeFor(100)).toMatchObject({ key: "diamond", level: 14, days: 100 });
  });

  it("says what's next and how far", () => {
    expect(nextBadge(0)).toMatchObject({ label: "Bronze", daysToGo: 5 });
    expect(nextBadge(12)).toMatchObject({ label: "Gold", daysToGo: 3 });
    expect(nextBadge(35)).toMatchObject({ label: "Diamond 2", daysToGo: 5 });
  });

  it("treats a broken streak as the start", () => {
    expect(tierFor(0)).toBe(0);
    expect(tierFor(-3)).toBe(0);
    expect(badgeAt(0)).toBeNull();
  });

  it("fills the ring a fifth a day, emptying as each badge lands", () => {
    expect(progressToNext(0)).toBe(0);
    expect(progressToNext(3)).toBe(0.6);
    expect(progressToNext(5)).toBe(0);
    expect(progressToNext(12)).toBe(0.4);
  });
});

// The glass pill's trip across. What jsdom can check is when it plays: only
// for a control that asked for glass, never on first paint, and afresh on
// every move after.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import SegmentPill from "@/components/SegmentPill";

const face = () => document.querySelector("span[aria-hidden] > span");
const pill = (index, glass = true) => <SegmentPill index={index} count={2} glass={glass} />;

describe("SegmentPill", () => {
  it("stays solid on first paint", () => {
    render(pill(1));
    expect(face().className).not.toMatch(/animate-segment/);
  });

  it("crosses as glass on each move, under a fresh name each time", () => {
    const { rerender } = render(pill(0));
    rerender(pill(1));
    expect(face()).toHaveClass("animate-segment-a");
    rerender(pill(0));
    expect(face()).toHaveClass("animate-segment-b");
    expect(face()).not.toHaveClass("animate-segment-a");
  });

  it("slides without glass for a control that didn't ask for it", () => {
    const { rerender } = render(pill(0, false));
    rerender(pill(1, false));
    expect(face().className).not.toMatch(/animate-segment|segment-glass/);
    expect(face()).toHaveClass("shadow-card");
  });

  it("draws nothing when no segment is selected", () => {
    render(pill(-1));
    expect(face()).toBeNull();
  });
});

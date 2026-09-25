// A remembered figure picks up where the reader last saw it. Without that, the
// hero on Home recounted from $0 on every visit, and a change you'd just caused
// on another tab looked the same as a figure appearing for the first time.
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";

import { useCountUp } from "@/hooks/useCountUp";

describe("useCountUp", () => {
  it("counts a first sighting up from zero", () => {
    const { result } = renderHook(() => useCountUp(50, { memoryKey: "first" }));
    expect(result.current).toBe(0);
  });

  it("starts a remembered figure where it was left, not at zero", () => {
    renderHook(() => useCountUp(32.4, { decimals: 2, memoryKey: "left" })).unmount();
    const { result } = renderHook(() => useCountUp(27.4, { decimals: 2, memoryKey: "left" }));
    // First frame is the old figure; it tweens down from here.
    expect(result.current).toBe(32.4);
  });

  it("shows an unchanged remembered figure as it is", () => {
    renderHook(() => useCountUp(50, { memoryKey: "same" })).unmount();
    const { result } = renderHook(() => useCountUp(50, { memoryKey: "same" }));
    expect(result.current).toBe(50);
  });

  it("keeps each key's memory to itself", () => {
    renderHook(() => useCountUp(50, { memoryKey: "a" })).unmount();
    const { result } = renderHook(() => useCountUp(80, { memoryKey: "b" }));
    expect(result.current).toBe(0);
  });
});

// The sheet's behaviour around the on-screen keyboard.
//
// iOS Safari doesn't shrink the layout viewport when the keyboard opens, so a
// fixed-position sheet stays anchored to the bottom of the page and sits behind
// it — you focus the description, type, and see nothing. jsdom has no
// visualViewport, so these fake one and drive its events.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

import BottomSheet from "@/components/BottomSheet";

const LAYOUT_HEIGHT = 800;

/** Install a controllable visualViewport, as mobile Safari would provide. */
function installViewport() {
  const listeners = { resize: [], scroll: [] };
  const vv = {
    height: LAYOUT_HEIGHT,
    offsetTop: 0,
    addEventListener: (type, fn) => listeners[type]?.push(fn),
    removeEventListener: (type, fn) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
    },
  };
  window.visualViewport = vv;
  window.innerHeight = LAYOUT_HEIGHT;

  return {
    /** Open a keyboard `px` tall, optionally with Safari scrolling by `offsetTop`. */
    openKeyboard(px, offsetTop = 0) {
      act(() => {
        vv.height = LAYOUT_HEIGHT - px - offsetTop;
        vv.offsetTop = offsetTop;
        listeners.resize.forEach((fn) => fn());
      });
    },
    close() {
      act(() => {
        vv.height = LAYOUT_HEIGHT;
        vv.offsetTop = 0;
        listeners.resize.forEach((fn) => fn());
      });
    },
    listenerCount: () => listeners.resize.length + listeners.scroll.length,
  };
}

/** The draggable sheet element that carries the offset. */
const sheet = () => screen.getByRole("dialog");
/** The card inside it, which is what gets height-capped. */
const panel = () => sheet().firstElementChild;

let viewport;

beforeEach(() => {
  viewport = installViewport();
});

afterEach(() => {
  delete window.visualViewport;
});

describe("keeping the sheet clear of the keyboard", () => {
  it("sits flush with the bottom while no keyboard is up", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Add expense">
        <input aria-label="Description" />
      </BottomSheet>
    );
    expect(sheet().style.bottom).toBe("");
    expect(panel().style.maxHeight).toBe("");
  });

  it("lifts by exactly what the keyboard covers", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Add expense">
        <input aria-label="Description" />
      </BottomSheet>
    );
    viewport.openKeyboard(300);
    expect(sheet().style.bottom).toBe("300px");
  });

  it("caps its height to the space left, so a tall form can't run off the top", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Add expense">
        <input aria-label="Description" />
      </BottomSheet>
    );
    viewport.openKeyboard(300);
    // Without this a lifted sheet just moves its overflow from the bottom of
    // the screen to the top, where there's no way to scroll it back.
    expect(panel().style.maxHeight).toBe("492px"); // 800 layout - 300 keyboard - 8
  });

  it("discounts the page scroll Safari does to reveal the field", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Add expense">
        <input aria-label="Description" />
      </BottomSheet>
    );
    // Keyboard 300 tall, and Safari scrolled the layout viewport 120 to show
    // the input. Only 300 is actually covered; lifting by 420 would leave a gap.
    viewport.openKeyboard(300, 120);
    expect(sheet().style.bottom).toBe("300px");
  });

  it("drops back down when the keyboard closes", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Add expense">
        <input aria-label="Description" />
      </BottomSheet>
    );
    viewport.openKeyboard(300);
    viewport.close();
    expect(sheet().style.bottom).toBe("");
    expect(panel().style.maxHeight).toBe("");
  });

  it("ignores shifts too small to be a keyboard", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Add expense">
        <input aria-label="Description" />
      </BottomSheet>
    );
    // A collapsing URL bar or a rubber-band scroll. Reacting would make the
    // sheet twitch every time the toolbar animates.
    viewport.openKeyboard(60);
    expect(sheet().style.bottom).toBe("");
  });

  it("stops listening once it closes", () => {
    const { rerender } = render(
      <BottomSheet open onClose={() => {}} title="Add expense">
        <input aria-label="Description" />
      </BottomSheet>
    );
    expect(viewport.listenerCount()).toBeGreaterThan(0);

    rerender(
      <BottomSheet open={false} onClose={() => {}} title="Add expense">
        <input aria-label="Description" />
      </BottomSheet>
    );
    expect(viewport.listenerCount()).toBe(0);
  });

  it("brings the focused field back into view once it has resized", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Add expense">
        <input aria-label="Description" />
      </BottomSheet>
    );
    const input = screen.getByLabelText("Description");
    input.scrollIntoView = vi.fn();
    act(() => input.focus());

    viewport.openKeyboard(300);

    // The field is focused before the keyboard finishes opening, so the
    // browser's own scroll-into-view ran against the pre-keyboard geometry.
    expect(input.scrollIntoView).toHaveBeenCalled();
  });

  it("survives a browser with no visualViewport at all", () => {
    delete window.visualViewport;
    render(
      <BottomSheet open onClose={() => {}} title="Add expense">
        <input aria-label="Description" />
      </BottomSheet>
    );
    expect(sheet().style.bottom).toBe("");
  });
});

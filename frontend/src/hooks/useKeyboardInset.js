import { useEffect, useState } from "react";

// A software keyboard is never shorter than this. Toolbar animations and
// rubber-band scrolling both briefly shrink the visual viewport by smaller
// amounts, and reacting to those would make the sheet twitch.
const MIN_KEYBOARD_PX = 100;

/**
 * How much of the layout viewport the on-screen keyboard is covering, and how
 * much room is left above it — both in pixels.
 *
 * iOS Safari does not shrink the *layout* viewport when the keyboard opens, so
 * a `position: fixed` bottom sheet stays anchored to the bottom of the page and
 * ends up behind the keyboard — you can focus a field, type into it, and see
 * none of it. The *visual* viewport does shrink, so the gap between the two is
 * exactly the strip that got covered.
 *
 * Returns 0 wherever this can't happen or can't be measured: desktop with a
 * hardware keyboard, browsers without the API, and jsdom.
 */
export function useKeyboardInset(active = true) {
  const [state, setState] = useState({ inset: 0, visibleHeight: 0 });

  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) {
      setState({ inset: 0, visibleHeight: 0 });
      return undefined;
    }

    const update = () => {
      // offsetTop matters: Safari often scrolls the layout viewport to reveal
      // the focused field, and without subtracting it the sheet over-lifts by
      // however far it scrolled.
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      const open = covered > MIN_KEYBOARD_PX;
      // The room left is measured, not recomputed in CSS. `calc(100dvh - …)`
      // would have to re-derive a height the visual viewport already reports
      // exactly, and dvh resolves differently again mid toolbar animation.
      setState({
        inset: open ? Math.round(covered) : 0,
        visibleHeight: open ? Math.round(vv.height) : 0,
      });
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);

  return state;
}

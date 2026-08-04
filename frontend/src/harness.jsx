/**
 * Design harness — a dev-only page for eyeballing components at device size,
 * in both themes, without booting the backend or logging in.
 *
 * Served by Vite at /harness.html (dev only; not part of the production build,
 * which has its own single `index.html` entry).
 *
 *   npm run dev
 *   open http://localhost:5173/harness.html?tone=destructive&press=1,2,.,5,0,+,8
 *
 * Query params:
 *   theme   light | dark              (default dark; applied in harness.html)
 *   view    calculator                (default calculator)
 *   tone    destructive | success     expense or income styling
 *   amount  seed value for the field, e.g. 48
 *   press   comma-separated key labels or aria-labels to click after mount,
 *           e.g. 1,2,.,5,0,+,8 — lets a screenshot capture a mid-expression
 *           state. Use aria-labels for icon keys: Backspace, Clear, Divide.
 *
 * `npm run shots` drives this with headless Chrome; see scripts/shots.mjs.
 */
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "framer-motion";

import BottomSheet from "./components/BottomSheet.jsx";
import AmountCalculator from "./components/AmountCalculator.jsx";
import "./index.css";

const params = new URLSearchParams(location.search);
const tone = params.get("tone") || "destructive";
const view = params.get("view") || "calculator";
const initialValue = params.get("amount") || "";
const press = (params.get("press") || "").split(",").filter(Boolean);
// Headless Chrome refuses to open a window narrower than 500px CSS, so a real
// 375px phone viewport can't be had from --window-size alone. The sheet is
// centred and capped at max-w-app, so pinning that cap reproduces phone width
// exactly where it matters: the sheet's own layout.
const width = params.get("width");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Click keypad keys one at a time. Each click must settle into React state
 * before the next is looked up, so this yields between presses rather than
 * firing them all in one synchronous loop.
 */
function useScriptedPresses() {
  const [done, setDone] = useState(press.length === 0);

  useEffect(() => {
    if (!press.length) return;
    let cancelled = false;
    (async () => {
      await wait(250); // let the sheet finish sliding up
      for (const label of press) {
        if (cancelled) return;
        const target = [...document.querySelectorAll("button")].find(
          (b) =>
            b.textContent.trim() === label ||
            b.getAttribute("aria-label") === label
        );
        if (!target) {
          console.warn(`[harness] no key matching ${JSON.stringify(label)}`);
        } else {
          target.click();
        }
        await wait(40);
      }
      if (cancelled) return;
      setDone(true);
      // Screenshot scripts poll for this.
      document.body.dataset.harnessReady = "1";
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return done;
}

/**
 * Publish the real CSS viewport onto <body>, so a screenshot script can assert
 * it captured the size it asked for. Headless Chrome's --window-size and
 * --force-device-scale-factor interact confusingly; this makes it checkable
 * instead of guessable.
 */
function useViewportReadout() {
  useEffect(() => {
    const publish = () => {
      document.body.dataset.viewport = `${window.innerWidth}x${window.innerHeight}`;
    };
    publish();
    window.addEventListener("resize", publish);
    return () => window.removeEventListener("resize", publish);
  }, []);
}

function Harness() {
  useViewportReadout();
  useScriptedPresses();

  if (view !== "calculator") {
    return <p style={{ padding: 24 }}>Unknown view: {view}</p>;
  }

  return (
    <>
      {width && (
        <style>{`.max-w-app{max-width:${Number(width)}px !important}`}</style>
      )}
      <BottomSheet open onClose={() => {}} title="Calculator" closeLabel="Back to form">
      <AmountCalculator
        initialValue={initialValue}
        tone={tone}
          onApply={() => {}}
          onCancel={() => {}}
        />
      </BottomSheet>
    </>
  );
}

/**
 * Animations are off by default. Under headless Chrome's --virtual-time-budget,
 * each framer-motion spring consumes virtual time; a handful of scripted key
 * presses can exhaust the budget mid-sequence and the screenshot then captures
 * a half-entered state that looks perfectly plausible. Static appearance is
 * identical either way. Pass ?motion=on to watch transitions by hand.
 */
const reducedMotion = params.get("motion") === "on" ? "user" : "always";

ReactDOM.createRoot(document.getElementById("root")).render(
  <MotionConfig reducedMotion={reducedMotion}>
    <Harness />
  </MotionConfig>
);

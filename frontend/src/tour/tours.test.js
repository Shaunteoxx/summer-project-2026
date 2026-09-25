// The tours are words pointing at elements. Both can drift: a redesign drops
// a `data-tour` and a step silently stops showing, or a tour grows until it's
// the lecture this was meant not to be. These keep both honest.
import { describe, it, expect } from "vitest";

import { ALL_TOURS, MARKS, REPLAYABLE, TOURS, doneIdFor } from "@/tour/tours";

// The app's own source, as text: every component and page, and not the tests.
// (The definitions are a .js file, so they can't vouch for themselves.)
const sources = Object.entries(
  import.meta.glob(["/src/**/*.jsx", "!/src/**/*.test.jsx"], {
    query: "?raw",
    import: "default",
    eager: true,
  })
);

const ctxFor = ({ exists = true, mode = "month" } = {}) => ({
  exists: () => exists,
  filled: () => false,
  noun: mode === "days" ? "period" : "month",
  mode,
  pathname: "/",
  coarse: false,
  username: "shaun",
  quest: null,
  navigate: () => {},
  start: () => {},
});

/** Every id a step can point at, including each branch of a function target. */
function targetsOf(step) {
  const { target } = step;
  if (typeof target === "function") {
    return [target(ctxFor({ exists: true })), target(ctxFor({ exists: false }))]
      .flat()
      .filter(Boolean);
  }
  return [target].flat().filter(Boolean);
}

const allSteps = Object.entries(TOURS).flatMap(([id, tour]) =>
  tour.steps.map((step, i) => ({ id, i, step }))
);

// Same shape the server checks (controllers/authController.js).
const SAVED_ID = /^[a-z][a-z0-9.-]{0,39}(@\d{1,3})?$/;

describe("what the tours point at", () => {
  const targets = [...new Set(allSteps.flatMap(({ step }) => targetsOf(step)))];

  it.each(targets)("%s is tagged somewhere in the app", (target) => {
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // data-tour="x", data-tour={cond ? "x" : …}, or a prop that becomes one.
    const tagged = new RegExp(`(data-tour|tour)=\\{?[^\\n}]*"${escaped}"`);
    const where = sources.filter(([, text]) => tagged.test(text)).map(([file]) => file);
    expect(where, `nothing renders data-tour="${target}"`).not.toHaveLength(0);
  });
});

describe("the words", () => {
  const cases = allSteps.flatMap(({ id, i, step }) =>
    ["month", "days", "term"].map((mode) => [`${id} step ${i + 1} (${mode})`, step, mode])
  );

  it.each(cases)("%s has a title and a body", (_, step, mode) => {
    const ctx = ctxFor({ mode });
    const title = typeof step.title === "function" ? step.title(ctx) : step.title;
    const body = typeof step.body === "function" ? step.body(ctx) : step.body;
    expect(title).toMatch(/\S/);
    expect(body).toMatch(/\S/);
    // A leaked expression reads as "undefined" or "[object Object]" on a card.
    expect(`${title} ${body}`).not.toMatch(/undefined|null|NaN|\[object/);
  });
});

describe("keeping it short", () => {
  it.each(Object.keys(TOURS).filter((id) => TOURS[id].kind === "page"))(
    "the %s tour is five steps at most",
    (id) => {
      expect(TOURS[id].steps.length).toBeLessThanOrEqual(5);
    }
  );

  it.each(Object.keys(TOURS).filter((id) => ["tip", "sheet"].includes(TOURS[id].kind)))(
    "the %s tip is three steps at most",
    (id) => {
      expect(TOURS[id].steps.length).toBeLessThanOrEqual(3);
    }
  );
});

describe("what gets saved", () => {
  it("names every tour and setup mark in a shape the server accepts", () => {
    const ids = [
      ...Object.keys(TOURS).map(doneIdFor).filter(Boolean),
      ...Object.values(MARKS),
    ];
    for (const id of ids) expect(id).toMatch(SAVED_ID);
  });

  it("gives setup moves no id of their own: their data says when they're done", () => {
    for (const id of Object.keys(TOURS).filter((k) => TOURS[k].kind === "quest")) {
      expect(doneIdFor(id)).toBeNull();
    }
  });

  it("can replay every page's tour from More, each on its own page", () => {
    for (const id of REPLAYABLE) {
      expect(TOURS[id].title).toBeTruthy();
      expect(TOURS[id].route).toMatch(/^\//);
    }
  });

  it("replays everything from Home, and never the setup", () => {
    expect(ALL_TOURS[0]).toBe("home");
    expect(ALL_TOURS.some((id) => id.startsWith("setup."))).toBe(false);
  });
});

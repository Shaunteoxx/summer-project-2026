// The rules that keep the tours from becoming a lecture: once per account,
// one page tour per visit, nothing over an open sheet, nothing with tips off
// — and a replay from More overriding all of it. Run against a small set of
// made-up tours, so these are about the engine rather than the words.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";

const markTours = vi.fn(() => Promise.resolve({}));
const forgetTours = vi.fn(() => Promise.resolve({}));
const updateProfile = vi.fn(() => Promise.resolve({}));
vi.mock("@/api/endpoints", () => ({
  markTours: (...a) => markTours(...a),
  forgetTours: (...a) => forgetTours(...a),
  updateProfile: (...a) => updateProfile(...a),
}));

let mockUser;
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock("@/hooks/useBudgetPeriod", () => ({
  useBudgetPeriod: () => ({ noun: "month", mode: "month" }),
}));
vi.mock("@/hooks/useCoarsePointer", () => ({ useCoarsePointer: () => false }));

vi.mock("@/tour/tours", async (importOriginal) => {
  const real = await importOriginal();
  const TOURS = {
    alpha: {
      kind: "page",
      version: 1,
      priority: 5,
      steps: [
        { target: "a.one", title: "First Thing", body: "About the first thing." },
        { target: "a.missing", title: "Never Shown", body: "Its element isn't there." },
        { target: "a.two", title: "Second Thing", body: "About the second thing." },
      ],
    },
    beta: {
      kind: "page",
      version: 1,
      priority: 5,
      steps: [{ target: "b.one", title: "Beta Thing", body: "About beta." }],
    },
    later: {
      kind: "page",
      version: 1,
      priority: 4,
      requires: "alpha",
      steps: [{ target: "l.one", title: "Later Thing", body: "Only after alpha." }],
    },
    guided: {
      kind: "quest",
      steps: [
        {
          target: "g.button",
          interactive: true,
          title: "Tap the Button",
          body: "Go on.",
          advanceOn: "thing:done",
          primary: null,
        },
        { target: null, title: "Nicely Done", body: "That's the move." },
      ],
    },
  };
  return {
    ...real,
    TOURS,
    doneIdFor: (id) =>
      TOURS[id]?.kind === "quest" ? null : TOURS[id] ? `${id}@${TOURS[id].version}` : null,
  };
});

import { TourProvider, useTour, useTourContext } from "@/tour/TourProvider";
import { emitTour } from "@/tour/signals";

// jsdom lays nothing out. Give every tagged element a real box, so the
// engine sees what a browser would; anything untagged stays zero-sized.
beforeEach(() => {
  vi.clearAllMocks();
  markTours.mockImplementation(() => Promise.resolve({}));
  forgetTours.mockImplementation(() => Promise.resolve({}));
  updateProfile.mockImplementation(() => Promise.resolve({}));
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function box() {
    return this.hasAttribute("data-tour")
      ? { top: 100, left: 20, right: 220, bottom: 150, width: 200, height: 50, x: 20, y: 100 }
      : { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
  });
});

/** A page that asks for `id` and renders the elements its steps point at. */
function Page({ id, ready = true, targets }) {
  useTour(id, ready);
  return (
    <div>
      {targets.map((t) => (
        <p key={t} data-tour={t}>
          {t}
        </p>
      ))}
    </div>
  );
}

function Controls() {
  const tour = useTourContext();
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => tour.start("guided")}>Start guided</button>
      <button onClick={() => tour.replay(["alpha"], "/")}>Replay alpha</button>
      <button onClick={() => navigate("/elsewhere")}>Go elsewhere</button>
      <button onClick={() => navigate("/")}>Go home</button>
    </>
  );
}

function show(ui, { tours = [], toursOff = false, path = "/" } = {}) {
  mockUser = { id: "u1", username: "shaun", tours, toursOff };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TourProvider startDelay={0}>
        <Controls />
        {ui}
      </TourProvider>
    </MemoryRouter>
  );
}

const alphaPage = <Page id="alpha" targets={["a.one", "a.two"]} />;

/** No tour card turns up within a generous wait. */
async function expectNoTour() {
  await new Promise((r) => setTimeout(r, 400));
  expect(document.querySelector("[data-tour-card]")).toBeNull();
}

describe("a page tour", () => {
  it("starts once the page asks, and counts only what's on screen", async () => {
    show(alphaPage);
    expect(await screen.findByRole("dialog", { name: "First Thing" })).toBeInTheDocument();
    // Three steps written, one with nothing to point at: it isn't counted.
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
  });

  it("walks forward and back, and is remembered once finished", async () => {
    const user = userEvent.setup();
    show(alphaPage);
    await screen.findByRole("dialog", { name: "First Thing" });

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("dialog", { name: "Second Thing" })).toBeInTheDocument();
    expect(screen.getByText("2 of 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("dialog", { name: "First Thing" });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("dialog", { name: "Second Thing" });

    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(document.querySelector("[data-tour-card]")).toBeNull());
    expect(markTours).toHaveBeenCalledWith(["alpha@1"]);
  });

  it("counts as seen when skipped, so it doesn't come back", async () => {
    const user = userEvent.setup();
    show(alphaPage);
    await screen.findByRole("dialog", { name: "First Thing" });
    await user.click(screen.getByRole("button", { name: "Skip" }));
    await waitFor(() => expect(document.querySelector("[data-tour-card]")).toBeNull());
    expect(markTours).toHaveBeenCalledWith(["alpha@1"]);
  });

  it("closes on Escape, the same as Skip", async () => {
    const user = userEvent.setup();
    show(alphaPage);
    await screen.findByRole("dialog", { name: "First Thing" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.querySelector("[data-tour-card]")).toBeNull());
    expect(markTours).toHaveBeenCalledWith(["alpha@1"]);
  });

  it("puts the reader's hands on the card: focus lands on its main button", async () => {
    show(alphaPage);
    await screen.findByRole("dialog", { name: "First Thing" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toHaveFocus());
  });
});

describe("when a tour may start", () => {
  it("never for one this account has already seen", async () => {
    show(alphaPage, { tours: ["alpha@1"] });
    await expectNoTour();
  });

  it("never with tips turned off", async () => {
    show(alphaPage, { toursOff: true });
    await expectNoTour();
  });

  it("not before the page is ready for it", async () => {
    show(<Page id="alpha" ready={false} targets={["a.one", "a.two"]} />);
    await expectNoTour();
  });

  it("not while a sheet is open over the page, but once it's closed", async () => {
    const { rerender } = show(
      <>
        {alphaPage}
        <div role="dialog" aria-modal="true" aria-label="Some sheet" />
      </>
    );
    await expectNoTour();
    mockUser = { ...mockUser };
    rerender(
      <MemoryRouter>
        <TourProvider startDelay={0}>
          <Controls />
          {alphaPage}
        </TourProvider>
      </MemoryRouter>
    );
    expect(await screen.findByRole("dialog", { name: "First Thing" })).toBeInTheDocument();
  });

  it("not until the tour it follows has run", async () => {
    show(<Page id="later" targets={["l.one"]} />);
    await expectNoTour();
  });

  it("once the tour it follows has run", async () => {
    show(<Page id="later" targets={["l.one"]} />, { tours: ["alpha@1"] });
    expect(await screen.findByRole("dialog", { name: "Later Thing" })).toBeInTheDocument();
  });

  // Two tours back to back is the lecture this is built to avoid. The second
  // waits for the next visit.
  it("one per visit: the next waits until the page is visited again", async () => {
    const user = userEvent.setup();
    show(
      <Routes>
        <Route
          path="/"
          element={
            <>
              {alphaPage}
              <Page id="beta" targets={["b.one"]} />
            </>
          }
        />
        <Route path="/elsewhere" element={<p>Elsewhere</p>} />
      </Routes>
    );
    await screen.findByRole("dialog", { name: "First Thing" });
    await user.click(screen.getByRole("button", { name: "Skip" }));
    await expectNoTour();

    await user.click(screen.getByRole("button", { name: "Go elsewhere" }));
    await user.click(screen.getByRole("button", { name: "Go home" }));
    expect(await screen.findByRole("dialog", { name: "Beta Thing" })).toBeInTheDocument();
  });
});

describe("a guided move", () => {
  it("lets the element itself be used, and moves on when the app says it was", async () => {
    const user = userEvent.setup();
    show(<Page id="none" ready={false} targets={["g.button"]} />);
    await user.click(screen.getByRole("button", { name: "Start guided" }));

    // Not a dialog: the page stays usable around the one element.
    expect(await screen.findByRole("region", { name: "Tap the Button" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();

    act(() => emitTour("thing:done"));
    expect(await screen.findByRole("dialog", { name: "Nicely Done" })).toBeInTheDocument();
  });

  it("doesn't wait forever for news it just missed", async () => {
    const user = userEvent.setup();
    show(<Page id="none" ready={false} targets={["g.button"]} />);
    await user.click(screen.getByRole("button", { name: "Start guided" }));
    // Fired before the step has even been drawn, as a fast save can.
    act(() => emitTour("thing:done"));
    expect(await screen.findByRole("dialog", { name: "Nicely Done" })).toBeInTheDocument();
  });
});

describe("replaying", () => {
  it("forgets the tour and runs it, even with tips off", async () => {
    const user = userEvent.setup();
    show(alphaPage, { tours: ["alpha@1"], toursOff: true });
    await expectNoTour();

    await user.click(screen.getByRole("button", { name: "Replay alpha" }));
    expect(forgetTours).toHaveBeenCalledWith(["alpha@1"]);
    expect(await screen.findByRole("dialog", { name: "First Thing" })).toBeInTheDocument();
  });
});

describe("without a provider", () => {
  it("asks for nothing and draws nothing", async () => {
    render(alphaPage);
    await expectNoTour();
  });
});

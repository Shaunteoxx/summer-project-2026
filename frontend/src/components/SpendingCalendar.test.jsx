// The period calendar grid. A period can start on any weekday and span more
// than one calendar month, so the things worth pinning down are the weekday
// alignment and the labelling that stops day numbers reading ambiguously.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SpendingCalendar from "@/components/SpendingCalendar";

/** Build the day shape DailySpendingCard hands down. */
const makeDays = (start, count, overrides = {}) => {
  const days = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(`${start}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const ymd = d.toISOString().slice(0, 10);
    days.push({
      ymd,
      index: i,
      day: d.getUTCDate(),
      monthIdx: d.getUTCMonth(),
      startsMonth: d.getUTCDate() === 1,
      amount: 0,
      budget: 20,
      over: false,
      isToday: false,
      isFuture: false,
      txns: [],
      ...(overrides[ymd] ?? {}),
    });
  }
  return days;
};

const grid = () => screen.getAllByRole("button").length;

describe("weekday alignment", () => {
  it("pads the first row to the period's starting weekday", () => {
    // 1 Aug 2026 is a Saturday -> six blank cells before it.
    const { container } = render(
      <SpendingCalendar days={makeDays("2026-08-01", 7)} budgetsAvailable onSelectDay={() => {}} />
    );
    const cells = container.querySelectorAll(".grid.grid-cols-7")[1].children;
    expect(cells).toHaveLength(6 + 7);
    // The pads are empty spans, the days are buttons.
    expect([...cells].slice(0, 6).every((c) => c.tagName === "SPAN")).toBe(true);
    expect(cells[6].tagName).toBe("BUTTON");
  });

  it("aligns to a mid-week start, not to the 1st of a month", () => {
    // 5 Aug 2026 is a Wednesday -> three blanks.
    const { container } = render(
      <SpendingCalendar days={makeDays("2026-08-05", 5)} budgetsAvailable onSelectDay={() => {}} />
    );
    const cells = container.querySelectorAll(".grid.grid-cols-7")[1].children;
    expect(cells).toHaveLength(3 + 5);
  });

  it("renders nothing when there are no days", () => {
    const { container } = render(
      <SpendingCalendar days={[]} budgetsAvailable onSelectDay={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("month tags", () => {
  it("labels the first day and each new month when the whole period is shown", () => {
    render(
      <SpendingCalendar
        days={makeDays("2026-08-28", 6)}
        budgetsAvailable
        onSelectDay={() => {}}
      />
    );
    // 28-31 Aug then 1-2 Sep: the run starts in Aug and rolls into Sep.
    expect(screen.getByText("Aug")).toBeInTheDocument();
    expect(screen.getByText("Sep")).toBeInTheDocument();
  });

  it("drops the tags when the caller pages by month", () => {
    // The pager header already names the month, so in-cell tags are noise.
    render(
      <SpendingCalendar
        days={makeDays("2026-08-28", 6)}
        budgetsAvailable
        showMonthTags={false}
        onSelectDay={() => {}}
      />
    );
    expect(screen.queryByText("Aug")).not.toBeInTheDocument();
    expect(screen.queryByText("Sep")).not.toBeInTheDocument();
  });
});

describe("day cells", () => {
  it("describes spending and the verdict for screen readers", () => {
    const days = makeDays("2026-08-01", 3, {
      "2026-08-02": { amount: 45, budget: 20, over: true },
      "2026-08-03": { amount: 5, budget: 20 },
    });
    render(<SpendingCalendar days={days} budgetsAvailable onSelectDay={() => {}} />);

    expect(screen.getByLabelText("2 Aug: spent $45.00, over budget")).toBeInTheDocument();
    expect(screen.getByLabelText("3 Aug: spent $5.00, within budget")).toBeInTheDocument();
  });

  it("disables future days and leaves their amount off", () => {
    const days = makeDays("2026-08-01", 2, {
      "2026-08-02": { isFuture: true },
    });
    render(<SpendingCalendar days={days} budgetsAvailable onSelectDay={() => {}} />);

    const future = screen.getByLabelText("2 Aug");
    expect(future).toBeDisabled();
    expect(future).not.toHaveTextContent("$");
  });

  it("hands the tapped day back to the caller", async () => {
    const onSelectDay = vi.fn();
    const days = makeDays("2026-08-01", 3, { "2026-08-02": { amount: 12 } });
    render(<SpendingCalendar days={days} budgetsAvailable onSelectDay={onSelectDay} />);

    await userEvent.click(screen.getByLabelText("2 Aug: spent $12.00, within budget"));
    expect(onSelectDay).toHaveBeenCalledOnce();
    expect(onSelectDay.mock.calls[0][0].ymd).toBe("2026-08-02");
  });

  it("marks an over-budget day with a ring, not colour alone", () => {
    const days = makeDays("2026-08-01", 1, {
      "2026-08-01": { amount: 45, over: true },
    });
    render(<SpendingCalendar days={days} budgetsAvailable onSelectDay={() => {}} />);
    expect(screen.getByLabelText(/over budget/)).toHaveClass("ring-1");
  });

  it("renders every day of a long month page", () => {
    render(
      <SpendingCalendar days={makeDays("2026-10-01", 31)} budgetsAvailable onSelectDay={() => {}} />
    );
    expect(grid()).toBe(31);
  });
});

// The sign placement. A negative amount used to render as "$-160.00", because
// the prefix was concatenated ahead of a number that carried its own minus.
// formatMoney has always put the sign first, so the same figure could appear
// two different ways on one screen — Home's "Total Saved" tile against the
// transaction rows below it.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Take the count-up animation out of it; the subject here is formatting.
vi.mock("@/hooks/useCountUp", () => ({ useCountUp: (value) => value }));

import AnimatedNumber from "@/components/AnimatedNumber";
import { formatMoney } from "@/lib/utils";

describe("AnimatedNumber", () => {
  it("puts the minus before the currency symbol, not after it", () => {
    render(<AnimatedNumber value={-160} prefix="$" decimals={2} />);
    expect(screen.getByText("-$160.00")).toBeInTheDocument();
  });

  it("agrees with formatMoney on the same amount", () => {
    render(<AnimatedNumber value={-1240.5} prefix="$" decimals={2} />);
    expect(screen.getByText(formatMoney(-1240.5))).toBeInTheDocument();
  });

  it("leaves a positive amount alone", () => {
    render(<AnimatedNumber value={1240.5} prefix="$" decimals={2} />);
    expect(screen.getByText("$1,240.50")).toBeInTheDocument();
  });

  it("still handles a suffix without a prefix", () => {
    render(<AnimatedNumber value={69} suffix="%" />);
    expect(screen.getByText("69%")).toBeInTheDocument();
  });
});

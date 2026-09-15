// The one remove control every managed list shares. What matters is that it
// takes two deliberate taps, that the second one says what it does, and that
// an armed delete can always be backed out of.
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ConfirmRemove from "@/components/ConfirmRemove";

function Harness({ onConfirm }) {
  const [armed, setArmed] = useState(false);
  return (
    <ConfirmRemove
      name="Trust"
      armed={armed}
      onArm={() => setArmed(true)}
      onConfirm={onConfirm}
      onCancel={() => setArmed(false)}
    />
  );
}

describe("removing from a managed list", () => {
  it("arms on the first tap and removes only on the second", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Remove Trust" }));
    expect(onConfirm).not.toHaveBeenCalled();

    // The confirm names the action in words, not a lone tick.
    const confirm = screen.getByRole("button", { name: "Yes, remove Trust" });
    expect(confirm).toHaveTextContent("Remove");
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("can always be backed out of", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Remove Trust" }));
    await user.click(screen.getByRole("button", { name: "Keep Trust" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remove Trust" })).toBeInTheDocument();
  });
});

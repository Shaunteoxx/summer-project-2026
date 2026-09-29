// The switch's contract with assistive tech, and the fact that the whole row
// is the hit target — the description is the widest part of the control, so a
// tap there has to count.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SwitchRow from "@/components/SwitchRow";

const setup = (props = {}) => {
  const onChange = vi.fn();
  render(
    <SwitchRow
      checked={false}
      onChange={onChange}
      label="Repeat Every Month"
      description="New months start with your latest target."
      {...props}
    />
  );
  return { onChange, control: screen.getByRole("switch") };
};

describe("SwitchRow", () => {
  it("announces itself as a switch with its on/off state", () => {
    const { control } = setup({ checked: true });
    expect(control).toHaveAccessibleName("Repeat Every Month");
    expect(control).toHaveAccessibleDescription("New months start with your latest target.");
    expect(control).toBeChecked();
  });

  it("reports off when unchecked", () => {
    const { control } = setup({ checked: false });
    expect(control).not.toBeChecked();
  });

  it("toggles from a tap anywhere in the row, description included", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ checked: false });
    await user.click(screen.getByText("New months start with your latest target."));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("hands back the flipped value, not the current one", async () => {
    const user = userEvent.setup();
    const { onChange, control } = setup({ checked: true });
    await user.click(control);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("ignores clicks while disabled, so an in-flight save can't be raced", async () => {
    const user = userEvent.setup();
    const { onChange, control } = setup({ disabled: true });
    await user.click(control);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("drops the description wiring when there isn't one", () => {
    const { control } = setup({ description: undefined });
    expect(control).not.toHaveAttribute("aria-describedby");
  });
});

// The knob crosses as glass when it flips. What jsdom can check is when that
// plays: never on first paint, where a switch that arrives already on would
// swell for nothing, and afresh on every flip after.
describe("the knob", () => {
  const knob = () => document.querySelector(".switch-knob");
  const row = (checked) => (
    <SwitchRow checked={checked} onChange={() => {}} label="Repeat Every Month" />
  );

  it("stays solid on first paint, even when it arrives on", () => {
    render(row(true));
    expect(knob().className).not.toMatch(/animate-switch/);
  });

  it("crosses as glass on each flip", () => {
    const { rerender } = render(row(false));
    rerender(row(true));
    expect(knob()).toHaveClass("animate-switch-on");
    // A different name each way, so the animation replays rather than being
    // skipped as already run.
    rerender(row(false));
    expect(knob()).toHaveClass("animate-switch-off");
    expect(knob()).not.toHaveClass("animate-switch-on");
  });
});

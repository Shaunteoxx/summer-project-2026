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

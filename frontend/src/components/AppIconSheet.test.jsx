// Picking the Home Screen icon in Safari, and what the installed app shows
// instead: a pick made there could never reach the Safari tab that adds the
// app again, so it gets the way to switch rather than controls that do nothing.
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AppIconSheet from "@/components/AppIconSheet";
import { APP_ICONS } from "@/lib/appIcon";

const touchIcon = () => document.querySelector('link[rel="apple-touch-icon"]');
const open = (props) => render(<AppIconSheet open onClose={() => {}} {...props} />);

beforeEach(() => {
  document.head.innerHTML = `<link rel="apple-touch-icon" href="${APP_ICONS[0].src}" />`;
});

describe("AppIconSheet in Safari", () => {
  it("starts on the wallet", () => {
    open({ installed: false });
    expect(screen.getByRole("button", { name: "Wallet" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Piggy Bank" })).toHaveAttribute("aria-pressed", "false");
  });

  it("changes the icon Safari will add as soon as one is picked", async () => {
    const user = userEvent.setup();
    open({ installed: false });
    await user.click(screen.getByRole("button", { name: "Piggy Bank" }));
    expect(screen.getByRole("button", { name: "Piggy Bank" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Wallet" })).toHaveAttribute("aria-pressed", "false");
    expect(touchIcon()).toHaveAttribute("href", APP_ICONS[1].src);
  });

  it("opens on this device's earlier pick", () => {
    localStorage.setItem("bnm_app_icon", "piggy");
    open({ installed: false });
    expect(screen.getByRole("button", { name: "Piggy Bank" })).toHaveAttribute("aria-pressed", "true");
  });

  it("says how to add the app", () => {
    open({ installed: false });
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
  });
});

describe("AppIconSheet in the installed app", () => {
  it("shows the icons without offering a pick that can't take effect", () => {
    open({ installed: true });
    expect(screen.getByText("Piggy Bank")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Piggy Bank" })).not.toBeInTheDocument();
  });

  it("gives the steps to switch", () => {
    open({ installed: true });
    expect(screen.getByText("Remove Broke No More from your Home Screen")).toBeInTheDocument();
    expect(screen.getByText("Open it in Safari and sign in")).toBeInTheDocument();
  });
});

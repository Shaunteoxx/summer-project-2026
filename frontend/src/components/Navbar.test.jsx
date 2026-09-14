// The demo banner's "Load Sample Data". Loading replaces every entry, so the
// part worth pinning is that it asks first when there's something to lose.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const loadDemoSample = vi.fn();
vi.mock("@/api/endpoints", () => ({
  loadDemoSample: (...args) => loadDemoSample(...args),
}));

let mockUser;
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser, logout: vi.fn() }),
}));
const toastError = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ error: (...a) => toastError(...a) }),
}));

// Not under test, and it needs a ThemeProvider.
vi.mock("@/components/ThemeToggle", () => ({ default: () => null }));

import Navbar from "@/components/Navbar";

const assign = vi.fn();

beforeEach(() => {
  mockUser = { isDemo: true, demoSampleLoaded: false };
  loadDemoSample.mockReset();
  toastError.mockReset();
  assign.mockReset();
  vi.stubGlobal("location", { ...window.location, assign });
});

const show = () =>
  render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );

describe("the demo banner", () => {
  it("offers sample data to an empty sandbox, and reloads onto it", async () => {
    loadDemoSample.mockResolvedValue({});
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole("button", { name: "Load Sample Data" }));

    expect(loadDemoSample).toHaveBeenCalledWith({ replace: false });
    expect(assign).toHaveBeenCalledWith("/");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks before replacing entries the visitor already added", async () => {
    loadDemoSample
      .mockRejectedValueOnce({ response: { status: 409, data: { existing: 3 } } })
      .mockResolvedValueOnce({});
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole("button", { name: "Load Sample Data" }));
    const sheet = within(await screen.findByRole("dialog"));
    expect(sheet.getByText(/3 entries/)).toBeInTheDocument();
    // Nothing is replaced until they say so.
    expect(assign).not.toHaveBeenCalled();

    await user.click(sheet.getByRole("button", { name: "Replace" }));
    expect(loadDemoSample).toHaveBeenLastCalledWith({ replace: true });
    expect(assign).toHaveBeenCalledWith("/");
  });

  it("leaves everything alone when the visitor cancels", async () => {
    loadDemoSample.mockRejectedValueOnce({
      response: { status: 409, data: { existing: 1 } },
    });
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole("button", { name: "Load Sample Data" }));
    const sheet = within(await screen.findByRole("dialog"));
    expect(sheet.getByText(/1 entry/)).toBeInTheDocument();
    await user.click(sheet.getByRole("button", { name: "Cancel" }));

    expect(loadDemoSample).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it("says so when loading fails", async () => {
    loadDemoSample.mockRejectedValue({ response: { status: 500 } });
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole("button", { name: "Load Sample Data" }));
    expect(toastError).toHaveBeenCalledWith("Couldn't load sample data. Please try again.");
    expect(screen.getByRole("button", { name: "Load Sample Data" })).toBeEnabled();
  });

  it("stops offering it once loaded", () => {
    mockUser = { isDemo: true, demoSampleLoaded: true };
    show();
    expect(screen.queryByRole("button", { name: "Load Sample Data" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
  });

  it("isn't there at all for a real account", () => {
    mockUser = { isDemo: false };
    show();
    expect(screen.queryByText(/Demo/)).not.toBeInTheDocument();
  });
});

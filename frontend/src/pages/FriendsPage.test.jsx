// The leaderboard when you're the only one on it.
//
// This isn't an empty page — your own savings rate is a real row above it — so
// it doesn't take the shared EmptyState. What it was missing is an action: it
// was the last note in the app that named a next step without offering it. The
// step is a field already on this screen, scrolled off the top by the time you
// have read down to the note, so it focuses that rather than sending anyone
// anywhere.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal()),
  localToday: () => "2026-09-06",
}));

const fetchRequests = vi.fn();
const fetchComparison = vi.fn();
const searchUsers = vi.fn();
vi.mock("@/api/endpoints", () => ({
  fetchRequests: (...a) => fetchRequests(...a),
  fetchComparison: (...a) => fetchComparison(...a),
  searchUsers: (...a) => searchUsers(...a),
  sendFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  declineFriendRequest: vi.fn(),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/hooks/useDemoGuard", () => ({ useDemoGuard: () => () => false }));
import FriendsPage from "@/pages/FriendsPage";

const me = { id: "u1", username: "sam", percentageSaved: 42, isMe: true };
const mate = { id: "u2", username: "alex", percentageSaved: 31 };

const show = async (leaderboard, through = "2026-08-31") => {
  fetchRequests.mockResolvedValue([]);
  fetchComparison.mockResolvedValue({ through, leaderboard });
  render(<FriendsPage />);
  await screen.findByText("Leaderboard");
};

beforeEach(() => {
  fetchRequests.mockReset();
  fetchComparison.mockReset();
  searchUsers.mockReset();
  // jsdom has no layout, so scrollIntoView isn't implemented on elements.
  Element.prototype.scrollIntoView = vi.fn();
});

describe("a leaderboard with only you on it", () => {
  it("offers the next step rather than only naming it", async () => {
    await show([me]);
    expect(
      await screen.findByRole("button", { name: /Find someone/ })
    ).toBeInTheDocument();
  });

  it("focuses the search field, which is already on this page", async () => {
    const user = userEvent.setup();
    await show([me]);
    await user.click(await screen.findByRole("button", { name: /Find someone/ }));
    await waitFor(() =>
      expect(screen.getByLabelText("Search users by username")).toHaveFocus()
    );
  });

  it("scrolls it back into view, since the note sits well below it", async () => {
    const user = userEvent.setup();
    await show([me]);
    await user.click(await screen.findByRole("button", { name: /Find someone/ }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});

describe("a leaderboard with someone else on it", () => {
  it("says nothing, because there is nothing to prompt", async () => {
    await show([me, mate]);
    expect(screen.queryByText(/Add friends to compare/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Find someone/ })
    ).not.toBeInTheDocument();
  });
});

// The board scores everyone all-time, over windows that have finished. Scoring
// the period each player was in the middle of put everyone near 100% on day 2
// and ranked them by who had logged least, so the header named your window;
// now it names where your own figures stop.
describe("what the header claims the board is", () => {
  it("names the figure as all-time rather than as this period", async () => {
    await show([me, mate]);
    expect(screen.getByText(/All-Time Savings Rate/)).toBeInTheDocument();
  });

  it("says which day your own figures run up to", async () => {
    await show([me, mate]);
    expect(screen.getByText(/up to 31 Aug 26/)).toBeInTheDocument();
  });

  it("says nothing extra when no window is being held back", async () => {
    // Days mode in the gap between two periods: everything counts already.
    await show([me, mate], null);
    expect(screen.getByText("All-Time Savings Rate")).toBeInTheDocument();
    expect(screen.queryByText(/up to/)).not.toBeInTheDocument();
  });
});

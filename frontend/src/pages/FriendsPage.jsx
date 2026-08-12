import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Search, UserPlus } from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import Avatar from "@/components/Avatar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  searchUsers,
  fetchRequests,
  fetchComparison,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
} from "@/api/endpoints";
import { useToast } from "@/hooks/useToast";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { cn, localToday } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period";
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
import { fadeUp, staggerContainer, fadeScaleItem } from "@/animations/variants";

export default function FriendsPage() {
  const toast = useToast();
  const guard = useDemoGuard();
  const budgetPeriod = useBudgetPeriod();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [requests, setRequests] = useState([]);
  const [comparison, setComparison] = useState(null);

  const loadRequests = () => fetchRequests().then(setRequests).catch(() => {});
  const loadComparison = () =>
    fetchComparison(localToday())
      .then(setComparison)
      .catch(() => toast.error("Couldn't load the leaderboard."));

  useEffect(() => {
    loadRequests();
    loadComparison();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const found = await searchUsers(query.trim());
      setResults(found);
      if (found.length === 0) toast.info(`No users found for “${query.trim()}”`);
    } catch {
      toast.error("Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  const handleSend = async (id) => {
    if (guard()) return;
    const username = results.find((u) => u.id === id)?.username;
    try {
      await sendFriendRequest(id);
      setResults((prev) =>
        prev.map((u) => (u.id === id ? { ...u, status: "pending" } : u))
      );
      toast.success(username ? `Request sent to ${username}` : "Friend request sent");
    } catch {
      toast.error("Couldn't send request. Please try again.");
    }
  };

  const handleAccept = async (id) => {
    if (guard()) return;
    const username = requests.find((r) => r.id === id)?.username;
    try {
      await acceptFriendRequest(id);
      setRequests((prev) => prev.filter((r) => r.id !== id));
      loadComparison();
      toast.success(username ? `You're now friends with ${username}` : "Friend request accepted");
    } catch {
      toast.error("Couldn't accept request. Please try again.");
    }
  };

  const handleDecline = async (id) => {
    if (guard()) return;
    const username = requests.find((r) => r.id === id)?.username;
    try {
      await declineFriendRequest(id);
      setRequests((prev) => prev.filter((r) => r.id !== id));
      toast.info(username ? `Declined ${username}'s request` : "Request declined");
    } catch {
      toast.error("Couldn't decline request. Please try again.");
    }
  };

  return (
    <PageWrapper>
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <h1 className="text-title-lg">Friends</h1>
        {/* Everyone is scored on their own budget period, so the header names
            yours rather than implying a shared window. */}
        <p className="mt-1 text-[13px] text-ink-3">
          Savings rate
          {comparison?.period
            ? ` · ${formatPeriodLabel(comparison.period, { mode: budgetPeriod.mode })}`
            : comparison
              ? " · no period running"
              : ""}
        </p>
      </motion.div>

      {/* Search sits bare on the canvas. It was a card with its own "Find
          people" heading, which made one input into a titled section. */}
      <motion.form
        variants={fadeUp}
        initial="initial"
        animate="animate"
        onSubmit={handleSearch}
        className="relative mt-4"
      >
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label="Search users by username"
          placeholder="Find someone by username"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
          disabled={searching}
        />
      </motion.form>

      {results.length > 0 && (
        <ListSection label={`Results · ${results.length}`}>
          <motion.ul
            variants={staggerContainer(0.06, 0.05)}
            initial="initial"
            animate="animate"
            key={results.length + query}
            className="[&>*+*]:border-t [&>*+*]:border-hairline"
          >
            {results.map((u) => (
              <motion.li key={u.id} variants={fadeScaleItem} className="flex items-center gap-3 px-4 py-[13px]">
                <Avatar user={u} className="h-[34px] w-[34px]" />
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium tracking-[-0.01em]">
                  {u.username}
                </span>
                {u.status === "friends" ? (
                  <RowNote>Friends</RowNote>
                ) : u.status === "pending" ? (
                  <RowNote>Requested</RowNote>
                ) : u.status === "incoming" ? (
                  <RowNote>Wants to add you</RowNote>
                ) : (
                  <PillButton onClick={() => handleSend(u.id)}>
                    <UserPlus className="h-3.5 w-3.5" /> Add
                  </PillButton>
                )}
              </motion.li>
            ))}
          </motion.ul>
        </ListSection>
      )}

      {requests.length > 0 && (
        <ListSection label={`Requests · ${requests.length}`}>
          <motion.ul
            variants={staggerContainer(0.08, 0.05)}
            initial="initial"
            animate="animate"
            className="[&>*+*]:border-t [&>*+*]:border-hairline"
          >
            {requests.map((r) => (
              <motion.li key={r.id} variants={fadeScaleItem} className="flex items-center gap-3 px-4 py-[13px]">
                <Avatar user={r} className="h-[34px] w-[34px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium tracking-[-0.01em]">
                    {r.username}
                  </span>
                  <span className="mt-0.5 block truncate text-meta text-ink-3">
                    Wants to compare
                  </span>
                </span>
                <span className="flex shrink-0 gap-1.5">
                  <PillButton
                    variant="outline"
                    aria-label={`Decline ${r.username}'s friend request`}
                    onClick={() => handleDecline(r.id)}
                  >
                    Decline
                  </PillButton>
                  <PillButton
                    aria-label={`Accept ${r.username}'s friend request`}
                    onClick={() => handleAccept(r.id)}
                  >
                    Accept
                  </PillButton>
                </span>
              </motion.li>
            ))}
          </motion.ul>
        </ListSection>
      )}

      {/* Leaderboard. The bars are gone: with a rank column and the rate
          written out, a bar scaled to the leader added a second encoding of
          the same number and made a list of five people look like a chart. */}
      <section className="mt-6">
        <h2 className="mb-2.5 px-0.5 text-overline text-ink-3">Leaderboard</h2>
        {!comparison ? (
          <div className="border-y border-hairline bg-surface">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-[13px] [&+&]:border-t [&+&]:border-hairline"
              >
                <Skeleton className="h-3 w-4" />
                <Skeleton className="h-[34px] w-[34px] rounded-full" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-9" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <motion.ul
              variants={staggerContainer(0.06, 0.1)}
              initial="initial"
              animate="animate"
              className="border-y border-hairline bg-surface [&>*+*]:border-t [&>*+*]:border-hairline"
            >
              {comparison.leaderboard.map((p, i) => (
                <motion.li
                  key={p.id}
                  variants={fadeScaleItem}
                  className={cn(
                    "flex items-center gap-3 px-4 py-[13px]",
                    p.isMe && "bg-surface-2"
                  )}
                >
                  <span
                    className={cn(
                      "num w-4 shrink-0 text-center text-[12.5px]",
                      i < 3 ? "font-semibold text-ink-2" : "font-medium text-ink-3"
                    )}
                  >
                    {i + 1}
                  </span>
                  <Avatar user={p} className="h-[34px] w-[34px]" />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium tracking-[-0.01em]">
                    {p.username}
                    {p.isMe && (
                      <span className="ml-1.5 text-[11px] font-medium text-ink-3">You</span>
                    )}
                  </span>
                  {/* Green here is the one it's allowed to be: money kept. */}
                  <span className="num shrink-0 text-[15px] font-medium text-positive">
                    {p.percentageSaved}%
                  </span>
                </motion.li>
              ))}
            </motion.ul>
            {comparison.leaderboard.length === 1 && (
              <p className="mt-3 px-0.5 text-[13px] leading-relaxed text-ink-3">
                Add friends to compare your savings with theirs.
              </p>
            )}
          </>
        )}
      </section>
    </PageWrapper>
  );
}

/** An overline-labelled group of rows in one card. */
function ListSection({ label, children }) {
  return (
    <motion.section
      variants={fadeUp}
      initial="initial"
      animate="animate"
      className="mt-6"
    >
      <h2 className="mb-2.5 px-0.5 text-overline text-ink-3">{label}</h2>
      <Card className="overflow-hidden">{children}</Card>
    </motion.section>
  );
}

/** A row's trailing status word — not an action, so it isn't a button. */
function RowNote({ children }) {
  return <span className="shrink-0 text-meta text-ink-3">{children}</span>;
}

/**
 * The compact 30px action button these rows use. Smaller than the app's
 * standard 46px Button, which would dominate a 56px row.
 */
function PillButton({ children, variant, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex h-[30px] shrink-0 items-center gap-1 rounded-[9px] px-2.5 text-[12.5px]",
        "transition-colors duration-base ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        variant === "outline"
          ? "border border-hairline-strong font-medium text-ink-2 hover:bg-surface-2"
          : "bg-ink font-semibold text-surface hover:bg-ink-2"
      )}
    >
      {children}
    </button>
  );
}

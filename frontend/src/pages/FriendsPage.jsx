import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  UserPlus,
  Check,
  X,
  Trophy,
  Crown,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import Avatar from "@/components/Avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { localToday } from "@/lib/utils";
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

  const maxPercent = Math.max(
    1,
    ...(comparison?.leaderboard?.map((p) => p.percentageSaved) ?? [1])
  );

  return (
    <PageWrapper>
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <h1 className="text-2xl font-extrabold tracking-tight">Friends</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Find friends and compare your savings.
        </p>
      </motion.div>

      <div className="mt-5 space-y-4">
        <div className="space-y-4">
          {/* Search */}
          <motion.div variants={fadeUp} initial="initial" animate="animate">
            <Card>
              <CardContent className="p-5">
                <h2 className="mb-4 flex items-center gap-2 font-semibold">
                  <Search className="h-4 w-4 text-primary" /> Find people
                </h2>
                <form onSubmit={handleSearch} className="flex gap-2">
                  <Input
                    type="search"
                    aria-label="Search users by username"
                    placeholder="Search by username"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <Button type="submit" disabled={searching}>
                    {searching ? "…" : "Search"}
                  </Button>
                </form>

                <motion.div
                  variants={staggerContainer(0.06, 0.05)}
                  initial="initial"
                  animate="animate"
                  className="mt-4 space-y-2"
                  key={results.length + query}
                >
                  {results.map((u) => (
                    <motion.div
                      key={u.id}
                      variants={fadeScaleItem}
                      className="flex items-center justify-between rounded-lg border border-border/70 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar user={u} className="h-9 w-9" />
                        <span className="font-medium">{u.username}</span>
                      </div>
                      {u.status === "friends" ? (
                        <span className="text-xs font-medium text-primary">Friends</span>
                      ) : u.status === "pending" ? (
                        <span className="text-xs text-muted-foreground">Requested</span>
                      ) : u.status === "incoming" ? (
                        <span className="text-xs text-muted-foreground">Wants to add you</span>
                      ) : (
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => handleSend(u.id)}>
                          <UserPlus className="h-3.5 w-3.5" /> Add
                        </Button>
                      )}
                    </motion.div>
                  ))}
                </motion.div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Incoming requests */}
          <motion.div variants={fadeUp} initial="initial" animate="animate">
            <Card>
              <CardContent className="p-5">
                <h2 className="mb-4 font-semibold">
                  Friend requests
                  {requests.length > 0 && (
                    <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                      {requests.length}
                    </span>
                  )}
                </h2>
                {requests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pending requests.</p>
                ) : (
                  <motion.div
                    variants={staggerContainer(0.08, 0.05)}
                    initial="initial"
                    animate="animate"
                    className="space-y-2"
                  >
                    {requests.map((r) => (
                      <motion.div
                        key={r.id}
                        variants={fadeScaleItem}
                        className="flex items-center justify-between rounded-lg border border-border/70 p-3"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar user={r} className="h-9 w-9" />
                          <span className="font-medium">{r.username}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="icon"
                            className="h-9 w-9"
                            aria-label={`Accept ${r.username}'s friend request`}
                            onClick={() => handleAccept(r.id)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-9 w-9"
                            aria-label={`Decline ${r.username}'s friend request`}
                            onClick={() => handleDecline(r.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Comparison leaderboard */}
        <motion.div variants={fadeUp} initial="initial" animate="animate">
          <Card>
            <CardContent className="p-5">
              <div className="mb-1 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">Savings Leaderboard</h2>
              </div>
              {/* Everyone is scored on their own budget period, so the header
                  names yours and each row carries its own dates. */}
              <p className="mb-5 text-sm text-muted-foreground">
                Savings rate ·{" "}
                {comparison?.period
                  ? formatPeriodLabel(comparison.period, { mode: budgetPeriod.mode })
                  : comparison
                    ? "no period running"
                    : ""}
              </p>

              {!comparison ? (
                <div className="space-y-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i}>
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-7 w-7 rounded-full" />
                          <Skeleton className="h-4 w-24" />
                        </div>
                        <Skeleton className="h-4 w-10" />
                      </div>
                      <Skeleton className="h-3 w-full rounded-full" />
                    </div>
                  ))}
                </div>
              ) : (
                <motion.div
                  variants={staggerContainer(0.1, 0.1)}
                  initial="initial"
                  animate="animate"
                  className="space-y-3"
                >
                  {comparison.leaderboard.map((p, i) => (
                    <motion.div key={p.id} variants={fadeScaleItem}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 font-medium">
                          {i === 0 && <Crown className="h-4 w-4 text-yellow-500" />}
                          <Avatar user={p} className="h-7 w-7" />
                          {p.username}
                          {p.isMe && (
                            <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                              You
                            </span>
                          )}
                        </span>
                        <span className="font-bold tabular-nums">
                          {p.percentageSaved}%
                        </span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-muted">
                        <motion.div
                          className={`h-full rounded-full ${
                            p.isMe ? "bg-primary" : "bg-primary/50"
                          }`}
                          initial={{ width: 0 }}
                          animate={{
                            width: `${(p.percentageSaved / maxPercent) * 100}%`,
                          }}
                          transition={{ duration: 0.9, delay: 0.2 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </div>
                    </motion.div>
                  ))}
                  {comparison.leaderboard.length === 1 && (
                    <p className="pt-2 text-sm text-muted-foreground">
                      Add friends to compare your savings with theirs.
                    </p>
                  )}
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </PageWrapper>
  );
}

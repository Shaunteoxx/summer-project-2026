import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import { resolveClientToday, roundMoney, ymd } from "../lib/validation.js";
import { dayFromYmd } from "../lib/period.js";
import { loadPeriodContext } from "../lib/periodContext.js";

// Escape regex metacharacters so user input can't inject a pattern
// (prevents ReDoS / catastrophic backtracking on the username search).
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** GET /api/friends/search?q= -> users matching username (excluding self & existing friends). */
export async function searchUsers(req, res) {
  const q = (req.query.q || "").trim().slice(0, 50);
  if (!q) return res.json([]);

  const me = req.user;
  const users = await User.find({
    username: { $regex: escapeRegex(q), $options: "i" },
    _id: { $ne: me._id },
    isDemo: { $ne: true },
  })
    .select("username profilePicture avatar friends friendRequests")
    .limit(10);

  const result = users.map((u) => {
    let status = "none";
    if (me.friends.some((f) => f.equals(u._id))) status = "friends";
    else if (me.friendRequests.some((r) => r.equals(u._id)))
      status = "incoming";
    else if (u.friendRequests.some((r) => r.equals(me._id)))
      status = "pending";
    return {
      id: u._id,
      username: u.username,
      profilePicture: u.profilePicture,
      avatar: u.avatar,
      status,
    };
  });

  res.json(result);
}

/** POST /api/friends/request/:id -> send a friend request. */
export async function sendRequest(req, res) {
  const targetId = req.params.id;
  if (targetId === String(req.user._id)) {
    return res.status(400).json({ message: "You cannot friend yourself" });
  }

  const target = await User.findOneAndUpdate(
    {
      _id: targetId,
      isDemo: { $ne: true },
      friends: { $ne: req.user._id },
      friendRequests: { $ne: req.user._id },
    },
    { $addToSet: { friendRequests: req.user._id } },
    { new: true }
  );
  if (!target) {
    return res.status(400).json({
      message: "User not found, already friends, or request already sent",
    });
  }

  res.json({ message: "Friend request sent" });
}

/** GET /api/friends/requests -> incoming friend requests. */
export async function getRequests(req, res) {
  const me = await User.findById(req.user._id).populate(
    "friendRequests",
    "username profilePicture avatar"
  );
  res.json(
    me.friendRequests.map((u) => ({
      id: u._id,
      username: u.username,
      profilePicture: u.profilePicture,
      avatar: u.avatar,
    }))
  );
}

/** POST /api/friends/accept/:id */
export async function acceptRequest(req, res) {
  const requesterId = req.params.id;
  const me = await User.findById(req.user._id);

  if (!me.friendRequests.some((r) => r.equals(requesterId))) {
    return res.status(400).json({ message: "No such friend request" });
  }

  me.friendRequests = me.friendRequests.filter((r) => !r.equals(requesterId));
  if (!me.friends.some((f) => f.equals(requesterId))) {
    me.friends.push(requesterId);
  }
  await me.save();

  const requester = await User.findById(requesterId);
  if (requester && !requester.friends.some((f) => f.equals(me._id))) {
    requester.friends.push(me._id);
    await requester.save();
  }

  res.json({ message: "Friend request accepted" });
}

/** POST /api/friends/decline/:id */
export async function declineRequest(req, res) {
  const requesterId = req.params.id;
  const me = await User.findById(req.user._id);
  me.friendRequests = me.friendRequests.filter((r) => !r.equals(requesterId));
  await me.save();
  res.json({ message: "Friend request declined" });
}

/** GET /api/friends -> list of friends. */
export async function getFriends(req, res) {
  const me = await User.findById(req.user._id).populate(
    "friends",
    "username profilePicture avatar"
  );
  res.json(
    me.friends.map((u) => ({
      id: u._id,
      username: u.username,
      profilePicture: u.profilePicture,
      avatar: u.avatar,
    }))
  );
}

/**
 * GET /api/friends/comparison -> savings% leaderboard (me + friends).
 *
 * Everyone is scored on their own active budget period, so each person's
 * number is the one they see on their own home screen. Savings % is a ratio,
 * so it stays comparable even when two people run different length periods.
 * Anyone with no period running right now simply scores 0.
 */
export async function getComparison(req, res) {
  const today = resolveClientToday(req.query.today);
  if (!today) return res.status(400).json({ message: "Invalid today date" });
  const todayKey = ymd(today);

  const me = await User.findById(req.user._id).populate(
    "friends",
    "username profilePicture avatar budgetMode savingsByMonth"
  );

  const people = [
    { user: me, isMe: true },
    ...me.friends.map((f) => ({ user: f, isMe: false })),
  ];

  // Each person's window differs, so resolve them first and then fetch all the
  // transactions in one query bounded by the widest span on the board.
  const entries = await Promise.all(
    people.map(async ({ user, isMe }) => ({
      user,
      isMe,
      period: (await loadPeriodContext(user, todayKey)).active,
    }))
  );

  const active = entries.filter((e) => e.period);
  const totals = new Map();

  if (active.length > 0) {
    const from = active.reduce((min, e) => (e.period.start < min ? e.period.start : min), active[0].period.start);
    const to = active.reduce((max, e) => (e.period.end > max ? e.period.end : max), active[0].period.end);

    const rows = await Transaction.find({
      userId: { $in: active.map((e) => e.user._id) },
      date: { $gte: dayFromYmd(from), $lte: dayFromYmd(to) },
    })
      .select("userId type amount date")
      .lean();

    // Bucket per user against that user's own period bounds.
    const boundsFor = new Map(active.map((e) => [String(e.user._id), e.period]));
    for (const row of rows) {
      const key = String(row.userId);
      const period = boundsFor.get(key);
      const day = ymd(new Date(row.date));
      if (!period || day < period.start || day > period.end) continue;
      const totalsFor = totals.get(key) ?? { income: 0, expenses: 0 };
      if (row.type === "income") totalsFor.income += row.amount;
      else totalsFor.expenses += row.amount;
      totals.set(key, totalsFor);
    }
  }

  const board = entries.map(({ user, isMe, period }) => {
    const summary = totals.get(String(user._id));
    const income = summary?.income || 0;
    const totalSaved = roundMoney(income - (summary?.expenses || 0));
    return {
      id: user._id,
      username: user.username,
      profilePicture: user.profilePicture,
      avatar: user.avatar,
      isMe,
      period: period ? { start: period.start, end: period.end, days: period.days } : null,
      percentageSaved: income > 0 ? Math.round((totalSaved / income) * 100) : 0,
      totalSaved,
    };
  });

  board.sort((a, b) => b.percentageSaved - a.percentageSaved);

  const mine = entries.find((e) => e.isMe)?.period ?? null;
  res.json({
    period: mine ? { start: mine.start, end: mine.end, days: mine.days } : null,
    leaderboard: board,
  });
}

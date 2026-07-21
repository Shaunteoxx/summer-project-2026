import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import { resolveClientToday, roundMoney } from "../lib/validation.js";

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

/** GET /api/friends/comparison -> savings% leaderboard (me + friends) for current month. */
export async function getComparison(req, res) {
  const today = resolveClientToday(req.query.today);
  if (!today) return res.status(400).json({ message: "Invalid today date" });
  const month = today.getUTCMonth();
  const year = today.getUTCFullYear();

  const me = await User.findById(req.user._id).populate(
    "friends",
    "username profilePicture avatar"
  );

  const people = [
    { id: me._id, username: me.username, profilePicture: me.profilePicture, avatar: me.avatar, isMe: true },
    ...me.friends.map((f) => ({
      id: f._id,
      username: f.username,
      profilePicture: f.profilePicture,
      avatar: f.avatar,
      isMe: false,
    })),
  ];

  // Aggregate canonical transactions in one query for the whole leaderboard.
  const summaries = await Transaction.aggregate([
    {
      $match: {
        userId: { $in: people.map((p) => p.id) },
        month,
        year,
      },
    },
    {
      $group: {
        _id: "$userId",
        income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
        expenses: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } },
      },
    },
  ]);
  const byUser = new Map(summaries.map((summary) => [String(summary._id), summary]));

  const board = people.map((p) => {
    const summary = byUser.get(String(p.id));
    const income = summary?.income || 0;
    const totalSaved = roundMoney(income - (summary?.expenses || 0));
    return {
      ...p,
      percentageSaved: income > 0 ? Math.round((totalSaved / income) * 100) : 0,
      totalSaved,
    };
  });

  board.sort((a, b) => b.percentageSaved - a.percentageSaved);

  res.json({ month, year, leaderboard: board });
}

import User from "../models/User.js";
import { resolveClientToday, ymd } from "../lib/validation.js";
import { loadPeriodContext } from "../lib/periodContext.js";
import { lifetimeSavingsFor } from "../lib/lifetime.js";

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
 * GET /api/friends/comparison -> all-time savings% leaderboard (me + friends).
 *
 * Everyone is scored on the same question: of everything you've earned over
 * the windows that have finished, how much did you keep. It used to score the
 * *running* period, which made the board a race nobody could lose — on day 2
 * of a month every player sits near 100%, because almost none of the money has
 * been spent yet, and the ranking mostly reported who had logged the least so
 * far. All-time is settled, so a position has to be earned over a whole window
 * before it shows up here.
 *
 * Each person still needs their own period context: it names the window that's
 * still running and therefore where their totals stop. Loading one for a friend
 * stays a pure read — see lib/savingsCarry.js.
 *
 * Savings % is a ratio, so it stays comparable between people with different
 * length periods, different income, or a lump sum instead of income at all.
 * Anyone with nothing finished yet simply scores 0.
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

  const entries = await Promise.all(
    people.map(async ({ user, isMe }) => ({
      user,
      isMe,
      context: await loadPeriodContext(user, todayKey),
    }))
  );

  const figures = await lifetimeSavingsFor(entries);

  const board = entries.map(({ user, isMe }) => {
    const mine = figures.get(String(user._id));
    return {
      id: user._id,
      username: user.username,
      profilePicture: user.profilePicture,
      avatar: user.avatar,
      isMe,
      percentageSaved: mine.rate,
      totalSaved: mine.saved,
    };
  });

  board.sort((a, b) => b.percentageSaved - a.percentageSaved);

  res.json({
    // The last day anyone's figures cover is their own, so the header speaks
    // for the reader rather than for the board.
    through: figures.get(String(me._id))?.through ?? null,
    leaderboard: board,
  });
}

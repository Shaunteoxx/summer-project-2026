import User from "../models/User.js";
import MonthlySummary from "../models/MonthlySummary.js";

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
  })
    .select("username profilePicture avatar")
    .limit(10);

  const result = users.map((u) => {
    let status = "none";
    if (me.friends.some((f) => f.equals(u._id))) status = "friends";
    else if (me.friendRequests.some((r) => r.equals(u._id)))
      status = "incoming"; // they already requested me
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

  const target = await User.findById(targetId);
  if (!target) return res.status(404).json({ message: "User not found" });

  if (target.friends.some((f) => f.equals(req.user._id))) {
    return res.status(400).json({ message: "Already friends" });
  }
  if (target.friendRequests.some((r) => r.equals(req.user._id))) {
    return res.status(400).json({ message: "Request already sent" });
  }

  target.friendRequests.push(req.user._id);
  await target.save();

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
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

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

  const board = await Promise.all(
    people.map(async (p) => {
      const summary = await MonthlySummary.findOne({
        userId: p.id,
        month,
        year,
      });
      return {
        ...p,
        percentageSaved: summary?.percentageSaved ?? 0,
        totalSaved: summary?.totalSaved ?? 0,
      };
    })
  );

  board.sort((a, b) => b.percentageSaved - a.percentageSaved);

  res.json({ month, year, leaderboard: board });
}

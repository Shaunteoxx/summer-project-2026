import User from "../models/User.js";

// Tour ids are the client's own names ("home@1", "setup.begun"), so only their
// shape is checked here. Lowercase, dotted, an optional @version — enough to
// keep the list from becoming somewhere to store arbitrary text.
const TOUR_ID_RE = /^[a-z][a-z0-9.-]{0,39}(@\d{1,3})?$/;
// About thirty ids exist today. The cap is room to grow, not a working limit —
// it stops a scripted client from growing the user document without end.
const MAX_TOURS = 200;
const MAX_TOURS_PER_CALL = 50;

/** The `ids` of a tours request, deduplicated, or null when it isn't valid. */
function tourIdsFrom(body) {
  const ids = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_TOURS_PER_CALL) {
    return null;
  }
  if (!ids.every((id) => typeof id === "string" && TOUR_ID_RE.test(id))) return null;
  return [...new Set(ids)];
}

/**
 * POST /api/auth/tours { ids } -> record tours as finished. Idempotent.
 *
 * $addToSet rather than editing req.user and saving: finishing a tour and a
 * tip in quick succession sends two requests, and two read-modify-write saves
 * of the whole array would let the second quietly undo the first.
 */
export async function markTours(req, res) {
  const ids = tourIdsFrom(req.body);
  if (!ids) return res.status(400).json({ message: "Invalid tour ids" });
  const known = new Set(req.user.tours || []);
  const fresh = ids.filter((id) => !known.has(id));
  if (known.size + fresh.length > MAX_TOURS) {
    return res.status(400).json({ message: "Too many tours" });
  }
  const updated = await User.findByIdAndUpdate(
    req.user._id,
    { $addToSet: { tours: { $each: ids } } },
    { new: true, projection: { tours: 1 } }
  );
  res.json({ tours: updated.tours });
}

/** POST /api/auth/tours/forget { ids } -> let those tours run again (a replay). */
export async function forgetTours(req, res) {
  const ids = tourIdsFrom(req.body);
  if (!ids) return res.status(400).json({ message: "Invalid tour ids" });
  const updated = await User.findByIdAndUpdate(
    req.user._id,
    { $pull: { tours: { $in: ids } } },
    { new: true, projection: { tours: 1 } }
  );
  res.json({ tours: updated.tours });
}

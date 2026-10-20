import { FIXED_CATEGORY_NAMES } from "../lib/entryFields.js";
import { HEX_COLOR } from "../lib/validation.js";

const MAX_CUSTOM_CATEGORIES = 20;

/** POST /api/auth/categories -> add a custom category for the current user. */
export async function addCategory(req, res) {
  const user = req.user;
  const name = String(req.body.name || "").trim();
  const { type, color } = req.body;

  if (!name || !type || !color) {
    return res.status(400).json({ message: "name, type and color are required" });
  }
  if (!["income", "expense"].includes(type)) {
    return res.status(400).json({ message: "Invalid type" });
  }
  if (!HEX_COLOR.test(color)) {
    return res.status(400).json({ message: "Invalid color" });
  }
  if (name.length > 24) {
    return res.status(400).json({ message: "Name too long (max 24 characters)" });
  }

  const lc = name.toLowerCase();
  const clashes =
    FIXED_CATEGORY_NAMES.some((n) => n.toLowerCase() === lc) ||
    user.customCategories.some((c) => c.name.toLowerCase() === lc);
  if (clashes) {
    return res.status(409).json({ message: "That category already exists" });
  }
  if (user.customCategories.length >= MAX_CUSTOM_CATEGORIES) {
    return res.status(400).json({ message: "Category limit reached" });
  }

  user.customCategories.push({ name, type, color });
  await user.save();
  const created = user.customCategories[user.customCategories.length - 1];
  res.status(201).json({
    id: created._id,
    name: created.name,
    type: created.type,
    color: created.color,
  });
}

/** DELETE /api/auth/categories/:id -> remove one of the user's custom categories. */
export async function removeCategory(req, res) {
  const user = req.user;
  const sub = user.customCategories.id(req.params.id);
  if (!sub) {
    return res.status(404).json({ message: "Category not found" });
  }
  user.customCategories.pull(req.params.id);
  await user.save();
  res.json({ message: "Deleted", id: req.params.id });
}

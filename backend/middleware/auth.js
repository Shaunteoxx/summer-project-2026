import jwt from "jsonwebtoken";
import User from "../models/User.js";

// Resolve the signing secret once at startup. In production a missing
// JWT_SECRET is fatal — falling back to a known string would let anyone
// forge tokens for any account. In dev we allow a clearly-marked fallback.
const isProd = process.env.NODE_ENV === "production";
const JWT_SECRET = process.env.JWT_SECRET || (isProd ? null : "dev_jwt_secret");
if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not set. Refusing to start in production without it."
  );
}

export function signToken(user) {
  return jwt.sign(
    { id: user._id, username: user.username },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.id).select("-__v");

    if (!user) {
      return res.status(401).json({ message: "User no longer exists" });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

// Read-only demo guard: lets demo accounts read freely but blocks any
// state-changing request. Mount AFTER requireAuth so req.user is populated.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export function blockDemoMutations(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.user?.isDemo) {
    return res.status(403).json({
      message: "This is a read-only demo. Sign in to make changes.",
      demo: true,
    });
  }
  next();
}

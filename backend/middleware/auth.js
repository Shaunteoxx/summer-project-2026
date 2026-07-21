import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { env } from "../config/env.js";

const JWT_SIGN_OPTIONS = {
  algorithm: "HS256",
  issuer: "broke-no-more-api",
  audience: "broke-no-more-web",
};
const JWT_VERIFY_OPTIONS = {
  algorithms: ["HS256"],
  issuer: JWT_SIGN_OPTIONS.issuer,
  audience: JWT_SIGN_OPTIONS.audience,
};

export function signToken(user) {
  return jwt.sign(
    { id: user._id, username: user.username },
    env.jwtSecret,
    { ...JWT_SIGN_OPTIONS, expiresIn: "2h" }
  );
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const payload = jwt.verify(token, env.jwtSecret, JWT_VERIFY_OPTIONS);
    const user = await User.findById(payload.id).select("-__v");

    if (!user) {
      return res.status(401).json({ message: "User no longer exists" });
    }

    req.user = user;
    next();
  } catch {
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

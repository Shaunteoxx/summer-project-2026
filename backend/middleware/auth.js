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

// How long a single token stays valid — in practice, how long the app can go
// unopened before you have to sign in again. Keep TOKEN_TTL_MS on the client
// (frontend/src/api/client.js) in sync with this.
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

// Hard ceiling on a sign-in, regardless of refreshes. /auth/refresh extends a
// session but never past this, so a stolen token cannot be renewed forever;
// after this you re-authenticate with Google.
const MAX_SESSION_SECONDS = 30 * 24 * 60 * 60;

const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * Sign a token for `user`. Pass the original sign-in time when refreshing so
 * the 30-day session ceiling survives re-issues instead of resetting.
 */
export function signToken(user, authAt = nowSeconds()) {
  return jwt.sign(
    {
      id: user._id,
      username: user.username,
      tv: user.tokenVersion || 0,
      authAt,
    },
    env.jwtSecret,
    { ...JWT_SIGN_OPTIONS, expiresIn: TOKEN_TTL_SECONDS }
  );
}

/** True once a session has outlived the ceiling and needs a real sign-in. */
export function sessionExhausted(authAt) {
  if (!Number.isFinite(authAt)) return true;
  return nowSeconds() - authAt > MAX_SESSION_SECONDS;
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

    // Tokens minted before tokenVersion existed carry no `tv`; treating that as
    // 0 matches the schema default, so live sessions survive the upgrade.
    if ((payload.tv ?? 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ message: "Session ended, please sign in again" });
    }

    // Enforce the ceiling here as well as on refresh, so it is a real cap on the
    // session rather than one that the last-issued token can outlive.
    if (sessionExhausted(payload.authAt ?? payload.iat)) {
      return res.status(401).json({ message: "Session expired, please sign in again" });
    }

    req.user = user;
    req.token = payload;
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

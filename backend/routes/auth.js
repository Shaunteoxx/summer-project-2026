import crypto from "node:crypto";
import express from "express";
import passport from "passport";
import { env } from "../config/env.js";
import { requireAuth, blockDemoMutations } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  googleCallback,
  demoLogin,
  refreshSession,
  logout,
  getMe,
  getHomeStats,
  addCategory,
  removeCategory,
  updateProfile,
  deleteAccount,
  setSavings,
} from "../controllers/authController.js";

const router = express.Router();
const stateCookie = "bnm_oauth_state";
const cookieOptions = {
  httpOnly: true,
  secure: env.production,
  sameSite: "lax",
  maxAge: 10 * 60 * 1000,
  path: "/api/auth/google/callback",
};
const oauthFailure = `${env.clientUrl}/login?error=oauth`;

function readCookie(req, name) {
  const entry = (req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === name);
  return entry ? decodeURIComponent(entry.slice(1).join("=")) : null;
}

function validState(actual, expected) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.get("/google", (req, res, next) => {
  const state = crypto.randomBytes(32).toString("base64url");
  res.cookie(stateCookie, state, cookieOptions);
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
    state,
  })(req, res, next);
});

router.get(
  "/google/callback",
  (req, res, next) => {
    const expected = readCookie(req, stateCookie);
    res.clearCookie(stateCookie, { ...cookieOptions, maxAge: undefined });
    if (!validState(req.query.state, expected)) return res.redirect(oauthFailure);
    next();
  },
  passport.authenticate("google", { session: false, failureRedirect: oauthFailure }),
  googleCallback
);

router.post("/demo", asyncHandler(demoLogin));
// No blockDemoMutations: re-issuing a token changes no state, and demo
// sessions need to survive a reload like any other.
router.post("/refresh", requireAuth, refreshSession);
router.post("/logout", requireAuth, asyncHandler(logout));
router.get("/me", requireAuth, asyncHandler(getMe));
router.get("/home", requireAuth, asyncHandler(getHomeStats));
router.post("/categories", requireAuth, blockDemoMutations, asyncHandler(addCategory));
router.delete("/categories/:id", requireAuth, blockDemoMutations, asyncHandler(removeCategory));
router.patch("/profile", requireAuth, blockDemoMutations, asyncHandler(updateProfile));
router.put("/savings", requireAuth, blockDemoMutations, asyncHandler(setSavings));
router.delete("/me", requireAuth, blockDemoMutations, asyncHandler(deleteAccount));

export default router;
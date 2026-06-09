import express from "express";
import passport from "passport";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  googleCallback,
  getMe,
  getHomeStats,
} from "../controllers/authController.js";

const router = express.Router();

router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/login" }),
  googleCallback
);

router.get("/me", requireAuth, asyncHandler(getMe));
router.get("/home", requireAuth, asyncHandler(getHomeStats));

export default router;

import express from "express";
import passport from "passport";
import { requireAuth, blockDemoMutations } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  googleCallback,
  demoLogin,
  getMe,
  getHomeStats,
  addCategory,
  removeCategory,
  updateProfile,
  deleteAccount,
  setSavings,
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

router.post("/demo", asyncHandler(demoLogin));

router.get("/me", requireAuth, asyncHandler(getMe));
router.get("/home", requireAuth, asyncHandler(getHomeStats));

// Writes below are blocked for the read-only demo account.
router.post("/categories", requireAuth, blockDemoMutations, asyncHandler(addCategory));
router.delete("/categories/:id", requireAuth, blockDemoMutations, asyncHandler(removeCategory));
router.patch("/profile", requireAuth, blockDemoMutations, asyncHandler(updateProfile));
router.put("/savings", requireAuth, blockDemoMutations, asyncHandler(setSavings));
router.delete("/me", requireAuth, blockDemoMutations, asyncHandler(deleteAccount));

export default router;

import express from "express";
import { requireAuth, blockDemoMutations } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getStreak, restoreStreak } from "../controllers/streakController.js";

const router = express.Router();

router.get("/", requireAuth, asyncHandler(getStreak));
router.post("/restore", requireAuth, blockDemoMutations, asyncHandler(restoreStreak));

export default router;

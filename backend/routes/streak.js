import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getStreak, restoreStreak } from "../controllers/streakController.js";

const router = express.Router();

router.get("/", requireAuth, asyncHandler(getStreak));
router.post("/restore", requireAuth, asyncHandler(restoreStreak));

export default router;

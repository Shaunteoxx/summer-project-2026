import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  getMonthlySummary,
  getAllSummaries,
  getLifetimeSummary,
} from "../controllers/summaryController.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", asyncHandler(getMonthlySummary));
router.get("/all", asyncHandler(getAllSummaries));
router.get("/lifetime", asyncHandler(getLifetimeSummary));

export default router;

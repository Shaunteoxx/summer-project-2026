import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  getMonthlySummary,
  getAllSummaries,
} from "../controllers/summaryController.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", asyncHandler(getMonthlySummary));
router.get("/all", asyncHandler(getAllSummaries));

export default router;

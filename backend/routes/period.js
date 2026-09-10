import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  getPeriod,
  setPeriodMode,
  createPeriod,
  updatePeriod,
  deletePeriod,
  createTerm,
  updateTerm,
  deleteTerm,
} from "../controllers/periodController.js";

const router = express.Router();

router.get("/", requireAuth, asyncHandler(getPeriod));
router.put("/mode", requireAuth, asyncHandler(setPeriodMode));
// Terms come before "/:id" so "term" is never read as a period id.
router.post("/term", requireAuth, asyncHandler(createTerm));
router.patch("/term/:id", requireAuth, asyncHandler(updateTerm));
router.delete("/term/:id", requireAuth, asyncHandler(deleteTerm));

router.post("/", requireAuth, asyncHandler(createPeriod));
router.patch("/:id", requireAuth, asyncHandler(updatePeriod));
router.delete("/:id", requireAuth, asyncHandler(deletePeriod));

export default router;

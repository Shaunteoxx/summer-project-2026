import express from "express";
import { requireAuth, blockDemoMutations } from "../middleware/auth.js";
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
router.put("/mode", requireAuth, blockDemoMutations, asyncHandler(setPeriodMode));
// Terms come before "/:id" so "term" is never read as a period id.
router.post("/term", requireAuth, blockDemoMutations, asyncHandler(createTerm));
router.patch("/term/:id", requireAuth, blockDemoMutations, asyncHandler(updateTerm));
router.delete("/term/:id", requireAuth, blockDemoMutations, asyncHandler(deleteTerm));

router.post("/", requireAuth, blockDemoMutations, asyncHandler(createPeriod));
router.patch("/:id", requireAuth, blockDemoMutations, asyncHandler(updatePeriod));
router.delete("/:id", requireAuth, blockDemoMutations, asyncHandler(deletePeriod));

export default router;

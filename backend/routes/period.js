import express from "express";
import { requireAuth, blockDemoMutations } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  getPeriod,
  setPeriodMode,
  createPeriod,
  updatePeriod,
  deletePeriod,
} from "../controllers/periodController.js";

const router = express.Router();

router.get("/", requireAuth, asyncHandler(getPeriod));
router.put("/mode", requireAuth, blockDemoMutations, asyncHandler(setPeriodMode));
router.post("/", requireAuth, blockDemoMutations, asyncHandler(createPeriod));
router.patch("/:id", requireAuth, blockDemoMutations, asyncHandler(updatePeriod));
router.delete("/:id", requireAuth, blockDemoMutations, asyncHandler(deletePeriod));

export default router;

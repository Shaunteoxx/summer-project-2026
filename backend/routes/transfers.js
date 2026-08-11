import express from "express";
import { requireAuth, blockDemoMutations } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  createTransfer,
  getTransfers,
  deleteTransfer,
} from "../controllers/transferController.js";

const router = express.Router();

router.use(requireAuth);
router.use(blockDemoMutations);

router.get("/", asyncHandler(getTransfers));
router.post("/", asyncHandler(createTransfer));
router.delete("/:id", asyncHandler(deleteTransfer));

export default router;

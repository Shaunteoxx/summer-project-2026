import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  getTransactions,
  createTransaction,
  deleteTransaction,
} from "../controllers/transactionController.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", asyncHandler(getTransactions));
router.post("/", asyncHandler(createTransaction));
router.delete("/:id", asyncHandler(deleteTransaction));

export default router;

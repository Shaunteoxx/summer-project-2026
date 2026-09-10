import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getAccountTotals } from "../controllers/accountController.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", asyncHandler(getAccountTotals));

export default router;

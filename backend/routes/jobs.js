import express from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { runNotificationsJob } from "../controllers/jobsController.js";

const router = express.Router();

router.post("/notifications", asyncHandler(runNotificationsJob));

export default router;

import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  getPublicKey,
  getSubscription,
  removeSubscription,
  saveSubscription,
  sendTestNotification,
} from "../controllers/pushController.js";

const router = express.Router();

router.use(requireAuth);
router.get("/key", asyncHandler(getPublicKey));
router.get("/subscription", asyncHandler(getSubscription));
router.post("/subscription", asyncHandler(saveSubscription));
router.post("/unsubscribe", asyncHandler(removeSubscription));
router.post("/test", asyncHandler(sendTestNotification));

export default router;

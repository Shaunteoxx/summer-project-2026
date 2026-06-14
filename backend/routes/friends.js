import express from "express";
import { requireAuth, blockDemoMutations } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  searchUsers,
  sendRequest,
  getRequests,
  acceptRequest,
  declineRequest,
  getFriends,
  getComparison,
} from "../controllers/friendController.js";

const router = express.Router();

router.use(requireAuth);
router.use(blockDemoMutations);

router.get("/", asyncHandler(getFriends));
router.get("/search", asyncHandler(searchUsers));
router.get("/requests", asyncHandler(getRequests));
router.get("/comparison", asyncHandler(getComparison));
router.post("/request/:id", asyncHandler(sendRequest));
router.post("/accept/:id", asyncHandler(acceptRequest));
router.post("/decline/:id", asyncHandler(declineRequest));

export default router;

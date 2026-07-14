import "dotenv/config";
import express from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import passport from "passport";

import { connectDB } from "./config/db.js";
import { configurePassport } from "./config/passport.js";

import authRoutes from "./routes/auth.js";
import transactionRoutes from "./routes/transactions.js";
import summaryRoutes from "./routes/summary.js";
import friendRoutes from "./routes/friends.js";
import streakRoutes from "./routes/streak.js";

const app = express();
const PORT = process.env.PORT || 5000;

// Cloud Run sits behind a proxy; trust it so rate-limit reads the real client IP.
app.set("trust proxy", 1);

// --- Security & parsing middleware ---
app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json({ limit: "16kb" }));

// Blanket rate limit on the whole API, with a stricter cap on login endpoints.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});
app.use("/api", apiLimiter);
// Only credential endpoints get the strict cap — the authenticated /auth
// routes (/me, /home, …) are hit on every page load and would exhaust it.
app.use(["/api/auth/google", "/api/auth/demo"], loginLimiter);

configurePassport();
app.use(passport.initialize());

// --- Routes ---
app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/summary", summaryRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/streak", streakRoutes);

// --- 404 + error handlers ---
app.use((req, res) => res.status(404).json({ message: "Not found" }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Malformed ObjectIds in params/queries are client errors, not crashes.
  if (err.name === "CastError") {
    return res.status(400).json({ message: "Invalid id" });
  }
  console.error("Server error:", err);
  // Don't leak internal error details to clients in production.
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message || "Internal server error";
  res.status(500).json({ message });
});

connectDB().then(() => {
  app.listen(PORT, () =>
    console.log(`🚀 Server running on http://localhost:${PORT}`)
  );
});

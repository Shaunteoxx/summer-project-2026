import "dotenv/config";
import express from "express";
import cors from "cors";
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

// --- Middleware ---
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

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
  console.error("Server error:", err);
  res.status(500).json({ message: err.message || "Internal server error" });
});

connectDB().then(() => {
  app.listen(PORT, () =>
    console.log(`🚀 Server running on http://localhost:${PORT}`)
  );
});

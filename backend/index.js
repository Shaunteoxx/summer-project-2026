import "dotenv/config";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import express from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import passport from "passport";

import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { configurePassport } from "./config/passport.js";
import authRoutes from "./routes/auth.js";
import transactionRoutes from "./routes/transactions.js";
import summaryRoutes from "./routes/summary.js";
import friendRoutes from "./routes/friends.js";
import streakRoutes from "./routes/streak.js";
import periodRoutes from "./routes/period.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((req, res, next) => {
  req.id = /^[\w-]{1,100}$/.test(req.get("x-request-id") || "")
    ? req.get("x-request-id")
    : crypto.randomUUID();
  res.set("x-request-id", req.id);
  next();
});
app.use(helmet());
app.use(compression());
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || origin === env.clientUrl);
  },
  credentials: true,
}));
app.use(express.json({ limit: "16kb" }));

app.get("/healthz", (req, res) => res.json({ status: "ok" }));
const readiness = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) throw new Error("not connected");
    await mongoose.connection.db.admin().ping();
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
};
app.get("/readyz", readiness);
app.get("/api/health", readiness);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
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
app.use(["/api/auth/google", "/api/auth/demo"], loginLimiter);

configurePassport();
app.use(passport.initialize());
app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/summary", summaryRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/streak", streakRoutes);
app.use("/api/period", periodRoutes);
app.use((req, res) => res.status(404).json({ message: "Not found" }));

app.use((err, req, res, next) => {
  if (err.name === "CastError") return res.status(400).json({ message: "Invalid id" });
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON body" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body is too large" });
  }
  if (err.name === "ValidationError") {
    return res.status(400).json({ message: "Invalid request data" });
  }
  if (err.code === 11000) {
    return res.status(409).json({ message: "That value is already in use" });
  }
  console.error("Unhandled request error", {
    requestId: req.id,
    message: err.message,
    ...(env.production ? {} : { stack: err.stack }),
  });
  res.status(500).json({ message: "Internal server error", requestId: req.id });
});

// Exported so tests can mount the real app on their own port and database.
export { app };

let server;
async function start() {
  await connectDB();
  server = app.listen(env.port, () => console.log(`Server listening on port ${env.port}`));
}

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
}

// Only boot when run directly (`node index.js`, incl. npm start and Docker).
// Importing this file — as the tests do — just yields the configured app.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.once(signal, () => {
      shutdown(signal).then(() => process.exit(0)).catch(() => process.exit(1));
    });
  }

  start().catch((err) => {
    console.error("Server startup failed", { message: err.message });
    process.exit(1);
  });
}
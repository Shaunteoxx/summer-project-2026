const VALID_NODE_ENVS = new Set(["development", "test", "production"]);
const nodeEnv = process.env.NODE_ENV || "development";

if (!VALID_NODE_ENVS.has(nodeEnv)) {
  throw new Error(`Invalid NODE_ENV: ${nodeEnv}`);
}

const production = nodeEnv === "production";
const requiredInProduction = [
  "MONGO_URI",
  "JWT_SECRET",
  "CLIENT_URL",
  "SERVER_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
];

if (production) {
  const missing = requiredInProduction.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing production environment variables: ${missing.join(", ")}`);
  }
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
  }
}

function origin(name, fallback) {
  const value = (process.env[name] || fallback).replace(/\/$/, "");
  const parsed = new URL(value);
  if (parsed.origin !== value || (production && parsed.protocol !== "https:")) {
    throw new Error(`${name} must be an ${production ? "HTTPS " : ""}origin without a path`);
  }
  return value;
}

const clientUrl = origin("CLIENT_URL", "http://localhost:5173");
const serverUrl = origin("SERVER_URL", "http://localhost:5000");
const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const googleCallbackUrl =
  process.env.GOOGLE_CALLBACK_URL || `${serverUrl}/api/auth/google/callback`;
const callback = new URL(googleCallbackUrl);
if (
  callback.origin !== serverUrl ||
  callback.pathname !== "/api/auth/google/callback" ||
  (production && callback.protocol !== "https:")
) {
  throw new Error(
    "GOOGLE_CALLBACK_URL must use SERVER_URL and /api/auth/google/callback"
  );
}

export const env = Object.freeze({
  nodeEnv,
  production,
  port,
  mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/brokenomore",
  jwtSecret: process.env.JWT_SECRET || "dev_jwt_secret",
  clientUrl,
  serverUrl,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleCallbackUrl,
});
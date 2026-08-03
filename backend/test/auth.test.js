// Session/auth behaviour, exercised against the real Express app and a real
// (in-memory) MongoDB. These cover the parts that fail silently and badly:
// revoked tokens that keep working, and refresh renewing a session forever.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const DAY = 86400;
const SECRET = "test-jwt-secret-at-least-32-characters-long";
const nowSeconds = () => Math.floor(Date.now() / 1000);

let mongo;
let server;
let base;
let User;
let signToken;

/** Sign a token the way the pre-upgrade build did: no `tv`, no `authAt`. */
const legacyToken = (user) =>
  jwt.sign({ id: user._id, username: user.username }, SECRET, {
    algorithm: "HS256",
    issuer: "broke-no-more-api",
    audience: "broke-no-more-web",
    expiresIn: "2h",
  });

const call = async (path, token, method = "GET") => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

let userSeq = 0;
const makeUser = (overrides = {}) => {
  userSeq += 1;
  return User.create({
    googleId: `google-${userSeq}`,
    username: `user${userSeq}`,
    email: `user${userSeq}@example.com`,
    ...overrides,
  });
};

before(async () => {
  mongo = await MongoMemoryServer.create();
  // config/env.js validates at import time, so the environment must be set
  // before the app is loaded — hence the dynamic imports below.
  Object.assign(process.env, {
    NODE_ENV: "development",
    MONGO_URI: mongo.getUri("authtest"),
    JWT_SECRET: SECRET,
    CLIENT_URL: "http://localhost:5173",
    SERVER_URL: "http://localhost:5000",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    GOOGLE_CALLBACK_URL: "http://localhost:5000/api/auth/google/callback",
  });

  const { app } = await import("../index.js");
  ({ default: User } = await import("../models/User.js"));
  ({ signToken } = await import("../middleware/auth.js"));

  await mongoose.connect(process.env.MONGO_URI);
  server = app.listen(0);
  await once(server, "listening");
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

describe("token issuance", () => {
  it("issues a 7-day token carrying the user's token version", async () => {
    const user = await makeUser();
    const claims = jwt.decode(signToken(user));
    assert.equal((claims.exp - claims.iat) / DAY, 7);
    assert.equal(claims.tv, 0);
    assert.ok(claims.authAt, "token records when the session began");
  });

  it("accepts a valid token", async () => {
    const user = await makeUser();
    assert.equal((await call("/api/auth/me", signToken(user))).status, 200);
  });

  it("rejects a request with no token", async () => {
    assert.equal((await call("/api/auth/me")).status, 401);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const user = await makeUser();
    const forged = jwt.sign({ id: user._id }, "not-the-real-secret-padding-xx", {
      algorithm: "HS256",
      issuer: "broke-no-more-api",
      audience: "broke-no-more-web",
      expiresIn: "7d",
    });
    assert.equal((await call("/api/auth/me", forged)).status, 401);
  });
});

describe("refresh", () => {
  it("returns a working replacement token", async () => {
    const user = await makeUser();
    const { status, body } = await call("/api/auth/refresh", signToken(user), "POST");
    assert.equal(status, 200);
    assert.equal((await call("/api/auth/me", body.token)).status, 200);
  });

  it("carries the original sign-in time forward, so the ceiling can't be reset", async () => {
    const user = await makeUser();
    const original = signToken(user);
    const { body } = await call("/api/auth/refresh", original, "POST");
    assert.equal(jwt.decode(body.token).authAt, jwt.decode(original).authAt);
  });
});

describe("session ceiling", () => {
  it("refreshes a session that is still under 30 days old", async () => {
    const user = await makeUser();
    const token = signToken(user, nowSeconds() - 29 * DAY);
    assert.equal((await call("/api/auth/refresh", token, "POST")).status, 200);
  });

  it("refuses to refresh a session past 30 days", async () => {
    const user = await makeUser();
    const token = signToken(user, nowSeconds() - 31 * DAY);
    assert.equal((await call("/api/auth/refresh", token, "POST")).status, 401);
  });

  it("rejects an over-age session on every route, not just refresh", async () => {
    // Otherwise the last token issued before the cap would outlive it by a week.
    const user = await makeUser();
    const token = signToken(user, nowSeconds() - 31 * DAY);
    assert.equal((await call("/api/auth/me", token)).status, 401);
  });
});

describe("sign-out revocation", () => {
  it("kills tokens that were captured before sign-out", async () => {
    const user = await makeUser();
    const stolen = signToken(user);

    assert.equal((await call("/api/auth/logout", signToken(user), "POST")).status, 200);
    assert.equal((await call("/api/auth/me", stolen)).status, 401);
    assert.equal((await call("/api/auth/refresh", stolen, "POST")).status, 401);
    assert.equal((await User.findById(user._id)).tokenVersion, 1);
  });

  it("lets the same user sign in again afterwards", async () => {
    const user = await makeUser();
    await call("/api/auth/logout", signToken(user), "POST");
    const reissued = signToken(await User.findById(user._id));
    assert.equal((await call("/api/auth/me", reissued)).status, 200);
  });
});

describe("tokens issued by the pre-upgrade build", () => {
  it("still authenticate, so deploying doesn't sign everyone out", async () => {
    const user = await makeUser();
    assert.equal((await call("/api/auth/me", legacyToken(user))).status, 200);
  });

  it("can be refreshed, falling back to iat for the session start", async () => {
    const user = await makeUser();
    assert.equal((await call("/api/auth/refresh", legacyToken(user), "POST")).status, 200);
  });

  it("are still revoked by a sign-out", async () => {
    const user = await makeUser();
    const old = legacyToken(user);
    await call("/api/auth/logout", signToken(user), "POST");
    assert.equal((await call("/api/auth/me", old)).status, 401);
  });
});

describe("shared demo account", () => {
  it("does not sign out other visitors when one of them logs out", async () => {
    // tokenVersion is per-user and the demo user is shared, so bumping it would
    // eject everyone currently exploring the demo.
    const demo = await makeUser({ isDemo: true });
    const visitorA = signToken(demo);
    const visitorB = signToken(demo);

    assert.equal((await call("/api/auth/logout", visitorA, "POST")).status, 200);
    assert.equal((await call("/api/auth/me", visitorB)).status, 200);
    assert.equal((await User.findById(demo._id)).tokenVersion, 0);
  });

  it("still blocks demo mutations", async () => {
    const demo = await makeUser({ isDemo: true });
    const res = await call("/api/auth/categories", signToken(demo), "POST");
    assert.equal(res.status, 403);
  });
});

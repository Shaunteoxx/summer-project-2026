// Which tours someone has seen. The list is small and the client owns what it
// means, so what's worth guarding is the part that fails quietly: a tour that
// keeps coming back because a mark was lost, one account's progress showing up
// on another, or the list turning into free storage for whatever gets posted.
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

const SECRET = "test-jwt-secret-at-least-32-characters-long";

let mongo;
let server;
let base;
let User;
let signToken;

const call = async (path, token, method = "GET", body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

let seq = 0;
const makeUser = async (overrides = {}) => {
  seq += 1;
  const user = await User.create({
    googleId: `google-t${seq}`,
    username: `tuser${seq}`,
    email: `tuser${seq}@example.com`,
    ...overrides,
  });
  return { user, token: signToken(user) };
};

const mark = (token, ids) => call("/api/auth/tours", token, "POST", { ids });
const forget = (token, ids) => call("/api/auth/tours/forget", token, "POST", { ids });

before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: "development",
    MONGO_URI: mongo.getUri("tourstest"),
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

beforeEach(async () => {
  await User.deleteMany({});
});

describe("tours on the profile", () => {
  it("starts empty with tips on, for an account that has never seen one", async () => {
    const { token } = await makeUser();
    const { status, body } = await call("/api/auth/me", token);
    assert.equal(status, 200);
    assert.deepEqual(body.tours, []);
    assert.equal(body.toursOff, false);
  });

  it("gives back what was marked on the next load, so a tour runs once", async () => {
    const { token } = await makeUser();
    const marked = await mark(token, ["home@1", "setup.begun"]);
    assert.equal(marked.status, 200);
    assert.deepEqual(marked.body.tours.sort(), ["home@1", "setup.begun"]);

    const { body } = await call("/api/auth/me", token);
    assert.deepEqual(body.tours.sort(), ["home@1", "setup.begun"]);
  });
});

describe("marking tours done", () => {
  it("keeps one copy of an id marked twice", async () => {
    const { token } = await makeUser();
    await mark(token, ["home@1"]);
    const { body } = await mark(token, ["home@1", "home@1", "tracker@1"]);
    assert.deepEqual(body.tours.sort(), ["home@1", "tracker@1"]);
  });

  // Finishing a tour and a tip a moment apart sends two requests. A
  // read-modify-write of the whole array would let the second overwrite the
  // first, and the lost tour would run again next visit.
  it("loses neither of two marks sent at the same time", async () => {
    const { token } = await makeUser();
    await Promise.all([
      mark(token, ["home@1"]),
      mark(token, ["tip.overspent@1"]),
      mark(token, ["transactions@1"]),
    ]);
    const { body } = await call("/api/auth/me", token);
    assert.deepEqual(body.tours.sort(), ["home@1", "tip.overspent@1", "transactions@1"]);
  });

  it("only touches the account that sent it", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await mark(a.token, ["home@1"]);
    const { body } = await call("/api/auth/me", b.token);
    assert.deepEqual(body.tours, []);
  });

  it("refuses ids that aren't tour names", async () => {
    const { token } = await makeUser();
    for (const ids of [
      undefined,
      [],
      "home@1",
      [42],
      ["Home@1"],
      ["home@one"],
      ["<script>"],
      ["a".repeat(41)],
      ["home@1234"],
    ]) {
      const { status } = await call("/api/auth/tours", token, "POST", { ids });
      assert.equal(status, 400, `accepted ${JSON.stringify(ids)}`);
    }
    const { body } = await call("/api/auth/me", token);
    assert.deepEqual(body.tours, []);
  });

  it("refuses a request that marks too many at once", async () => {
    const { token } = await makeUser();
    const ids = Array.from({ length: 51 }, (_, i) => `tip.x${i}@1`);
    assert.equal((await mark(token, ids)).status, 400);
  });

  it("stops the list growing without end", async () => {
    const existing = Array.from({ length: 199 }, (_, i) => `tip.y${i}@1`);
    const { token } = await makeUser({ tours: existing });
    assert.equal((await mark(token, ["tip.z1@1", "tip.z2@1"])).status, 400);
    // Re-marking what's already there adds nothing, so it isn't refused.
    assert.equal((await mark(token, ["tip.y0@1"])).status, 200);
    assert.equal((await mark(token, ["tip.z1@1"])).status, 200);
  });

  it("needs a session", async () => {
    assert.equal((await mark(null, ["home@1"])).status, 401);
  });
});

describe("replaying tours", () => {
  it("forgets only the ids named, leaving the rest seen", async () => {
    const { token } = await makeUser({
      tours: ["home@1", "tracker@1", "setup.begun", "setup.done"],
    });
    const { status, body } = await forget(token, ["home@1", "tracker@1"]);
    assert.equal(status, 200);
    assert.deepEqual(body.tours.sort(), ["setup.begun", "setup.done"]);
  });

  it("is fine forgetting something that was never marked", async () => {
    const { token } = await makeUser({ tours: ["home@1"] });
    const { status, body } = await forget(token, ["plan@1"]);
    assert.equal(status, 200);
    assert.deepEqual(body.tours, ["home@1"]);
  });

  it("refuses the same malformed ids marking does", async () => {
    const { token } = await makeUser({ tours: ["home@1"] });
    assert.equal((await forget(token, [])).status, 400);
    assert.equal((await forget(token, ["HOME"])).status, 400);
  });
});

describe("turning tips off", () => {
  it("is saved on the account and read back", async () => {
    const { token } = await makeUser();
    const off = await call("/api/auth/profile", token, "PATCH", { toursOff: true });
    assert.equal(off.status, 200);
    assert.equal(off.body.toursOff, true);
    assert.equal((await call("/api/auth/me", token)).body.toursOff, true);

    await call("/api/auth/profile", token, "PATCH", { toursOff: false });
    assert.equal((await call("/api/auth/me", token)).body.toursOff, false);
  });

  it("takes a real boolean, not something that merely looks like one", async () => {
    const { token } = await makeUser();
    const { status } = await call("/api/auth/profile", token, "PATCH", { toursOff: "yes" });
    assert.equal(status, 400);
    assert.equal((await call("/api/auth/me", token)).body.toursOff, false);
  });

  it("leaves the rest of the profile alone", async () => {
    const { user, token } = await makeUser({ avatar: "cat" });
    await call("/api/auth/profile", token, "PATCH", { toursOff: true });
    const fresh = await User.findById(user._id);
    assert.equal(fresh.avatar, "cat");
    assert.equal(fresh.username, user.username);
  });
});

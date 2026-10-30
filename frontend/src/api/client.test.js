/**
 * The API client against a real local server: what each request puts on the
 * wire, and what the app gets back. Every page's own tests mock the endpoints,
 * so this is the one place the client itself runs.
 *
 * The server sits on another port from the test page, so it answers the
 * cross-origin checks a browser makes, the same as the real API on Cloud Run.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import http from "node:http";

let server;
let base;
let api;
let setToken;
let getToken;
const seen = [];

const ANSWERS = {
  "/api/echo": (req) => [200, { ok: true, method: req.method }],
  "/api/refuse": () => [400, { message: "Nope" }],
  "/api/conflict": () => [409, { message: "You have entries", existing: 3 }],
  "/api/down": () => [500, "<h1>Down</h1>", "text/html"],
  "/api/signed-out": () => [401, { message: "Not signed in" }],
};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const path = req.url.split("?")[0];
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      // Never answers, for the timeout.
      if (path === "/api/hang") return;
      const [status, payload, type = "application/json"] = ANSWERS[path](req);
      res.statusCode = status;
      res.setHeader("Content-Type", type);
      res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  // Read once, when the client loads, so it has to be in place before.
  vi.stubEnv("VITE_API_URL", base);
  ({ default: api, setToken, getToken } = await import("@/api/client"));
});

afterAll(() => {
  vi.unstubAllEnvs();
  server.closeAllConnections();
  server.close();
});

beforeEach(() => {
  seen.length = 0;
  window.history.replaceState(null, "", "/");
});

describe("what a request sends", () => {
  it("puts the query in the URL the way it always has, leaving out empty values", async () => {
    await api.get("/echo", {
      params: { today: "2026-08-10", q: "a b,c:d$e&f", n: 3, gone: undefined, none: null },
    });
    expect(seen[0].method).toBe("GET");
    expect(seen[0].url).toBe("/api/echo?today=2026-08-10&q=a+b,c:d$e%26f&n=3");
  });

  it("asks for JSON, and sends the token once there is one", async () => {
    await api.get("/echo");
    expect(seen[0].headers.accept).toBe("application/json, text/plain, */*");
    expect(seen[0].headers.authorization).toBeUndefined();

    setToken("abc.def.ghi");
    await api.get("/echo");
    expect(seen[1].headers.authorization).toBe("Bearer abc.def.ghi");
  });

  it("sends a body as JSON", async () => {
    await api.post("/echo", { a: 1, b: null, c: "x" });
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers["content-type"]).toBe("application/json");
    expect(seen[0].body).toBe('{"a":1,"b":null,"c":"x"}');
  });

  it("sends no body and no content type when there's nothing to send", async () => {
    await api.post("/echo");
    expect(seen[0].body).toBe("");
    expect(seen[0].headers["content-type"]).toBeUndefined();
  });

  it("uses each method's own verb", async () => {
    await api.put("/echo", { a: 1 });
    await api.patch("/echo", { a: 1 });
    await api.delete("/echo");
    expect(seen.map((r) => r.method)).toEqual(["PUT", "PATCH", "DELETE"]);
  });
});

describe("what comes back", () => {
  it("hands back the parsed body and the status", async () => {
    const res = await api.get("/echo");
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true, method: "GET" });
  });

  it("rejects a refusal with its status and the server's answer", async () => {
    const err = await api.get("/refuse").catch((e) => e);
    expect(err.response.status).toBe(400);
    expect(err.response.data).toEqual({ message: "Nope" });
  });

  it("keeps the rest of a refusal's body, which the demo sample reads", async () => {
    const err = await api.post("/conflict", {}).catch((e) => e);
    expect(err.response.status).toBe(409);
    expect(err.response.data.existing).toBe(3);
  });

  it("keeps a body that isn't JSON as text", async () => {
    const err = await api.get("/down").catch((e) => e);
    expect(err.response.status).toBe(500);
    expect(err.response.data).toBe("<h1>Down</h1>");
  });

  it("signs out on a 401", async () => {
    // Already on the login page, so it has nowhere to send you.
    window.history.replaceState(null, "", "/login");
    setToken("abc.def.ghi");
    const err = await api.get("/signed-out").catch((e) => e);
    expect(err.response.status).toBe(401);
    expect(getToken()).toBeNull();
  });
});

describe("when there's no answer", () => {
  it("gives up after 15 seconds, with no response to read", async () => {
    expect(api.defaults.timeout).toBe(15000);
    // Shortened for the test. The client reads it on every request.
    api.defaults.timeout = 200;
    try {
      const err = await api.get("/hang").catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err.response).toBeUndefined();
    } finally {
      api.defaults.timeout = 15000;
    }
  });

  it("fails with no response when the server can't be reached", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_URL", "http://127.0.0.1:9");
    const { default: offline } = await import("@/api/client");
    const err = await offline.get("/echo").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.response).toBeUndefined();
    vi.stubEnv("VITE_API_URL", base);
  });
});

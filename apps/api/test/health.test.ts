import { afterEach, describe, expect, it } from "vitest";

import { buildServer } from "../src/server.js";

const servers = new Set<ReturnType<typeof buildServer>>();

afterEach(async () => {
  await Promise.all([...servers].map(async (server) => server.close()));
  servers.clear();
});

describe("health endpoint", () => {
  it("reports only process health and no financial readiness claims", async () => {
    const server = buildServer();
    servers.add(server);

    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ name: "OrbitOS API", status: "ok" });
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("keeps liveness separate from dependency-aware readiness", async () => {
    const server = buildServer({
      readinessChecks: [
        { check: () => Promise.resolve("ok"), name: "database" },
        { check: () => Promise.resolve("degraded"), name: "object_store" },
        { check: () => Promise.resolve("ok"), name: "providers" },
      ],
    });
    servers.add(server);

    const response = await server.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      checks: [
        { name: "database", status: "ok" },
        { name: "object_store", status: "degraded" },
        { name: "providers", status: "ok" },
      ],
      name: "OrbitOS API",
      status: "ready",
    });
  });

  it("fails closed without leaking dependency errors", async () => {
    const server = buildServer({
      readinessChecks: [
        { check: () => Promise.resolve("ok"), name: "database" },
        { check: () => Promise.reject(new Error("private storage endpoint and credential")), name: "object_store" },
        { check: () => Promise.resolve("ok"), name: "providers" },
      ],
    });
    servers.add(server);

    const response = await server.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      checks: expect.arrayContaining([{ name: "object_store", status: "unavailable" }]),
      status: "not_ready",
    });
    expect(response.body).not.toContain("private storage endpoint");
  });

  it("bounds dependency checks with a readiness timeout", async () => {
    const server = buildServer({
      readinessChecks: [{
        check: () => new Promise<"ok">(() => undefined),
        name: "database",
        timeoutMilliseconds: 5,
      }],
    });
    servers.add(server);

    const response = await server.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      checks: [{ name: "database", status: "unavailable" }],
      status: "not_ready",
    });
  });

  it("propagates only validated correlation IDs and exports tenant-safe metrics", async () => {
    const server = buildServer();
    servers.add(server);

    const correlated = await server.inject({
      headers: { "x-request-id": "release-check-123" },
      method: "GET",
      url: "/health",
    });
    const rejected = await server.inject({
      headers: { "x-request-id": "bad id with spaces" },
      method: "GET",
      url: "/health",
    });
    const metrics = await server.inject({ method: "GET", url: "/metrics" });

    expect(correlated.headers["x-request-id"]).toBe("release-check-123");
    expect(rejected.headers["x-request-id"]).not.toBe("bad id with spaces");
    expect(metrics.statusCode).toBe(200);
    expect(metrics.body).toContain('orbitos_http_requests_total{method="GET",route="/health",status_class="2xx"} 2');
    expect(metrics.body).not.toContain("tenant");
  });

  it("returns a stable error for oversized payloads and rate-limits API abuse", async () => {
    const server = buildServer({
      apiRateLimit: { maximumRequests: 1, windowMilliseconds: 60_000 },
      requestBodyLimitBytes: 64,
    });
    servers.add(server);

    const oversized = await server.inject({
      method: "POST",
      payload: { email: "operator@example.com", password: "x".repeat(100) },
      url: "/v1/auth/sessions",
    });
    expect(oversized.statusCode).toBe(413);
    expect(oversized.json().error).toMatchObject({ code: "PAYLOAD_TOO_LARGE" });

    const limited = await server.inject({ method: "GET", url: "/v1/session" });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error).toMatchObject({ code: "RATE_LIMITED" });
    expect(limited.headers["retry-after"]).toBeDefined();
  });
});

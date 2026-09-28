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
  });
});

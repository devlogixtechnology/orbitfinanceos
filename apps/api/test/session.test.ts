import type { SessionAuthenticator } from "@orbitos/authz";
import type { SessionContext } from "@orbitos/canonical-model";
import { afterEach, describe, expect, it } from "vitest";

import { buildServer } from "../src/server.js";

const authenticatedSession: SessionContext = {
  actor: {
    actorId: "11111111-1111-4111-8111-111111111111",
    subject: "identity-provider|operator-1",
  },
  authenticatedAt: "2026-09-28T01:00:00.000Z",
  expiresAt: "2026-09-28T02:00:00.000Z",
  permissions: ["integrations:read", "evidence:read"],
  roles: ["operator"],
  schemaVersion: "1",
  tenant: {
    displayName: "Synthetic Treasury",
    tenantId: "22222222-2222-4222-8222-222222222222",
  },
};

const authenticator: SessionAuthenticator = {
  authenticate: (token) =>
    Promise.resolve(token === "valid-token" ? authenticatedSession : null),
};

const servers = new Set<ReturnType<typeof buildServer>>();

afterEach(async () => {
  await Promise.all([...servers].map(async (server) => server.close()));
  servers.clear();
});

describe("GET /v1/session", () => {
  it("fails closed when authentication is not configured", async () => {
    const server = buildServer();
    servers.add(server);

    const response = await server.inject({
      headers: { authorization: "Bearer valid-token" },
      method: "GET",
      url: "/v1/session",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "INVALID_CREDENTIAL" },
    });
  });

  it("requires a well-formed Bearer credential", async () => {
    const server = buildServer({ authenticator });
    servers.add(server);

    const response = await server.inject({
      method: "GET",
      url: "/v1/session",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        requestId: expect.any(String),
      },
    });
  });

  it("returns only the tenant context resolved by the authenticator", async () => {
    const server = buildServer({ authenticator });
    servers.add(server);

    const response = await server.inject({
      headers: {
        authorization: "Bearer valid-token",
        "x-orbitos-tenant-id": "99999999-9999-4999-8999-999999999999",
      },
      method: "GET",
      url: "/v1/session",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(authenticatedSession);
  });

  it("does not distinguish invalid from expired or unauthorized credentials", async () => {
    const server = buildServer({ authenticator });
    servers.add(server);

    const response = await server.inject({
      headers: { authorization: "Bearer unknown-token" },
      method: "GET",
      url: "/v1/session",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "INVALID_CREDENTIAL" },
    });
  });

  it("reports provider outages without leaking provider details", async () => {
    const unavailableAuthenticator: SessionAuthenticator = {
      authenticate: () => Promise.reject(new Error("private provider detail")),
    };
    const server = buildServer({ authenticator: unavailableAuthenticator });
    servers.add(server);

    const response = await server.inject({
      headers: { authorization: "Bearer valid-token" },
      method: "GET",
      url: "/v1/session",
    });

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("private provider detail");
    expect(response.json()).toMatchObject({
      error: { code: "AUTHENTICATION_UNAVAILABLE" },
    });
  });

  it("rejects invalid identity-provider output before it becomes tenant context", async () => {
    const invalidAuthenticator: SessionAuthenticator = {
      authenticate: () =>
        Promise.resolve({
          ...authenticatedSession,
          tenant: {
            ...authenticatedSession.tenant,
            tenantId: "request-supplied-tenant",
          },
        } as SessionContext),
    };
    const server = buildServer({ authenticator: invalidAuthenticator });
    servers.add(server);

    const response = await server.inject({
      headers: { authorization: "Bearer valid-token" },
      method: "GET",
      url: "/v1/session",
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      error: { code: "INVALID_SESSION_CONTEXT" },
    });
  });
});

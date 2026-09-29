import {
  InMemoryCustomAuthRepository,
  PasswordSessionService,
  hashPassword,
} from "@orbitos/authz";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildServer } from "../src/server.js";

const email = "orbitos@devlogix.com.pk";
const password = "OrbitOS test password 2026!";
const token = "c".repeat(43);
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(password);
}, 15_000);

const servers = new Set<ReturnType<typeof buildServer>>();

afterAll(async () => {
  await Promise.all([...servers].map(async (server) => server.close()));
});

function createServer() {
  const repository = new InMemoryCustomAuthRepository([
    {
      actorId: "11111111-1111-4111-8111-111111111111",
      email,
      failedAuthenticationCount: 0,
      lockedUntil: null,
      passwordHash,
      roles: ["administrator"],
      subject: email,
      tenantDisplayName: "Devlogix OrbitOS Staging",
      tenantId: "22222222-2222-4222-8222-222222222222",
    },
  ]);
  const sessionService = new PasswordSessionService(repository, {
    clock: () => new Date("2026-09-29T00:00:00.000Z"),
    idGenerator: () => "33333333-3333-4333-8333-333333333333",
    tokenGenerator: () => token,
  });
  const server = buildServer({
    authenticator: sessionService,
    sessionService,
  });
  servers.add(server);
  return server;
}

describe("custom authentication API", () => {
  it("creates, resolves, and revokes an opaque session", async () => {
    const server = createServer();
    const signIn = await server.inject({
      method: "POST",
      payload: { email: email.toUpperCase(), password },
      url: "/v1/auth/sessions",
    });

    expect(signIn.statusCode).toBe(201);
    expect(signIn.headers["cache-control"]).toBe("no-store");
    expect(signIn.body).not.toContain(password);
    expect(signIn.json()).toMatchObject({ token });

    const session = await server.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "GET",
      url: "/v1/session",
    });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      actor: { subject: email },
      tenant: { displayName: "Devlogix OrbitOS Staging" },
    });

    const signOut = await server.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "DELETE",
      url: "/v1/auth/session",
    });
    expect(signOut.statusCode).toBe(204);

    const revoked = await server.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "GET",
      url: "/v1/session",
    });
    expect(revoked.statusCode).toBe(401);
  }, 20_000);

  it("uses a generic response for invalid credentials", async () => {
    const server = createServer();
    const response = await server.inject({
      method: "POST",
      payload: { email, password: "wrong password value" },
      url: "/v1/auth/sessions",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "INVALID_CREDENTIAL" },
    });
  }, 15_000);

  it("rate limits attempts before expensive password verification", async () => {
    const server = buildServer({
      signInRateLimit: { maximumAttempts: 2, windowMilliseconds: 60_000 },
    });
    servers.add(server);

    await server.inject({ method: "POST", payload: {}, url: "/v1/auth/sessions" });
    await server.inject({ method: "POST", payload: {}, url: "/v1/auth/sessions" });
    const response = await server.inject({
      method: "POST",
      payload: {},
      url: "/v1/auth/sessions",
    });

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("60");
    expect(response.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
  });
});

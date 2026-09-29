import { describe, expect, it } from "vitest";

import {
  InMemoryCustomAuthRepository,
  PasswordSessionService,
  denyAllAuthenticator,
  hashPassword,
  hasPermission,
  readBearerToken,
  validateSessionContext,
  verifyPassword,
} from "../src/index.js";

const session = {
  actor: {
    actorId: "11111111-1111-4111-8111-111111111111",
    subject: "identity-provider|operator-1",
  },
  authenticatedAt: "2026-09-28T01:00:00.000Z",
  expiresAt: "2026-09-28T02:00:00.000Z",
  permissions: ["integrations:read", "evidence:read"],
  roles: ["operator"],
  schemaVersion: "1" as const,
  tenant: {
    displayName: "Synthetic Treasury",
    tenantId: "22222222-2222-4222-8222-222222222222",
  },
};

describe("tenant authorization boundary", () => {
  it("accepts only a single well-formed Bearer credential", () => {
    expect(readBearerToken("Bearer opaque-token")).toBe("opaque-token");
    expect(readBearerToken("bearer opaque-token")).toBe("opaque-token");
    expect(readBearerToken("Bearer first second")).toBeUndefined();
    expect(readBearerToken(undefined)).toBeUndefined();
  });

  it("fails closed when no identity provider has been configured", async () => {
    await expect(denyAllAuthenticator.authenticate("anything")).resolves.toBeNull();
  });

  it("validates identity-provider output before it becomes tenant context", () => {
    expect(validateSessionContext(session)).toEqual(session);
    expect(() =>
      validateSessionContext({
        ...session,
        tenant: { ...session.tenant, tenantId: "not-a-uuid" },
      }),
    ).toThrow();
  });

  it("checks explicit permissions without inferring them from role names", () => {
    expect(hasPermission(session, "evidence:read")).toBe(true);
    expect(hasPermission(session, "evidence:write")).toBe(false);
  });

  it("hashes passwords with a unique memory-hard scrypt representation", async () => {
    const first = await hashPassword("OrbitOS test password 2026!", {
      salt: Uint8Array.from({ length: 16 }, (_, index) => index),
    });
    const second = await hashPassword("OrbitOS test password 2026!", {
      salt: Uint8Array.from({ length: 16 }, (_, index) => index + 1),
    });

    expect(first).not.toBe(second);
    await expect(
      verifyPassword("OrbitOS test password 2026!", first),
    ).resolves.toBe(true);
    await expect(verifyPassword("wrong password value", first)).resolves.toBe(
      false,
    );
  }, 15_000);

  it("creates, validates, locks, and revokes opaque sessions", async () => {
    const passwordHash = await hashPassword("OrbitOS test password 2026!");
    const repository = new InMemoryCustomAuthRepository([
      {
        actorId: "11111111-1111-4111-8111-111111111111",
        email: "orbitos@devlogix.com.pk",
        failedAuthenticationCount: 0,
        lockedUntil: null,
        passwordHash,
        roles: ["administrator"],
        subject: "orbitos@devlogix.com.pk",
        tenantDisplayName: "Devlogix OrbitOS Staging",
        tenantId: "22222222-2222-4222-8222-222222222222",
      },
    ]);
    let now = new Date("2026-09-29T00:00:00.000Z");
    const token = "b".repeat(43);
    const service = new PasswordSessionService(repository, {
      clock: () => now,
      idGenerator: () => "33333333-3333-4333-8333-333333333333",
      lockThreshold: 2,
      tokenGenerator: () => token,
    });

    await expect(
      service.createSession("orbitos@devlogix.com.pk", "wrong password value"),
    ).resolves.toBeNull();
    await expect(
      service.createSession("orbitos@devlogix.com.pk", "wrong password value"),
    ).resolves.toBeNull();
    await expect(
      service.createSession(
        "orbitos@devlogix.com.pk",
        "OrbitOS test password 2026!",
      ),
    ).resolves.toBeNull();

    now = new Date("2026-09-29T00:16:00.000Z");
    await expect(
      service.createSession(
        "orbitos@devlogix.com.pk",
        "OrbitOS test password 2026!",
      ),
    ).resolves.toMatchObject({ token });
    await expect(service.authenticate(token)).resolves.toMatchObject({
      permissions: [
        "evidence:read",
        "exceptions:read",
        "exceptions:write",
        "ingestion:read",
        "ingestion:write",
        "integrations:read",
        "integrations:write",
        "movements:read",
        "reconciliation:read",
        "reconciliation:write",
        "verification:read",
      ],
    });

    await service.revokeSession(token);
    await expect(service.authenticate(token)).resolves.toBeNull();
  }, 30_000);
});

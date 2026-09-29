import type { SessionAuthenticator } from "@orbitos/authz";
import type { SessionContext } from "@orbitos/canonical-model";
import { InMemoryIntegrationRepository } from "@orbitos/integration-core";
import { afterEach, describe, expect, it } from "vitest";

import { buildServer } from "../src/server.js";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";

function session(
  tenantId: string,
  permissions: readonly string[],
): SessionContext {
  return {
    actor: {
      actorId: "33333333-3333-4333-8333-333333333333",
      subject: `identity-provider|${tenantId}`,
    },
    authenticatedAt: "2026-09-28T01:00:00.000Z",
    expiresAt: "2026-09-28T02:00:00.000Z",
    permissions: [...permissions],
    roles: ["administrator"],
    schemaVersion: "1",
    tenant: { displayName: `Tenant ${tenantId.slice(0, 4)}`, tenantId },
  };
}

const sessions = new Map([
  ["tenant-a-admin", session(tenantA, ["integrations:read", "integrations:write"])],
  ["tenant-a-reader", session(tenantA, ["integrations:read"])],
  ["tenant-b-reader", session(tenantB, ["integrations:read"])],
]);
const authenticator: SessionAuthenticator = {
  authenticate: (token) => Promise.resolve(sessions.get(token) ?? null),
};

const configuration = {
  finalityPolicyVersion: "bsc-finality-v1",
  network: { chainId: "97", family: "evm" },
  provider: "bsc-json-rpc",
  providerGroups: [
    {
      endpointReference: "secret://bsc-testnet/provider-a/endpoint",
      groupId: "provider-a",
      independenceGroup: "operator-a",
      secretReference: "secret://bsc-testnet/provider-a/token",
    },
  ],
  schemaVersion: "1",
  startingBlock: "12345678",
  tokenContracts: ["0x2222222222222222222222222222222222222222"],
  walletAddresses: ["0x1111111111111111111111111111111111111111"],
};

const servers = new Set<ReturnType<typeof buildServer>>();

afterEach(async () => {
  await Promise.all([...servers].map(async (server) => server.close()));
  servers.clear();
});

describe("integration configuration API", () => {
  it("creates tenant-scoped configuration without echoing references", async () => {
    const identifiers = [
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ];
    const integrationRepository = new InMemoryIntegrationRepository({
      clock: () => new Date("2026-09-28T04:00:00.000Z"),
      idGenerator: () => identifiers.shift() ?? "unexpected",
    });
    const server = buildServer({ authenticator, integrationRepository });
    servers.add(server);

    const response = await server.inject({
      headers: { authorization: "Bearer tenant-a-admin" },
      method: "POST",
      payload: configuration,
      url: "/v1/integrations",
    });

    expect(response.statusCode).toBe(201);
    expect(response.body).not.toContain("secret://");
    expect(response.json()).toMatchObject({
      integrationId: "44444444-4444-4444-8444-444444444444",
      tenantId: tenantA,
    });
  });

  it("denies mutation without the write permission", async () => {
    const server = buildServer({
      authenticator,
      integrationRepository: new InMemoryIntegrationRepository(),
    });
    servers.add(server);

    const response = await server.inject({
      headers: { authorization: "Bearer tenant-a-reader" },
      method: "POST",
      payload: configuration,
      url: "/v1/integrations",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { code: "PERMISSION_DENIED" },
    });
  });

  it("edits and disables only the authenticated tenant integration", async () => {
    const identifiers = [
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
    ];
    const integrationRepository = new InMemoryIntegrationRepository({
      idGenerator: () => identifiers.shift() ?? "unexpected",
    });
    const created = await integrationRepository.create({
      actorId: "33333333-3333-4333-8333-333333333333",
      configuration: configuration as never,
      tenantId: tenantA,
    });
    const server = buildServer({ authenticator, integrationRepository });
    servers.add(server);

    const response = await server.inject({
      headers: { authorization: "Bearer tenant-a-admin" },
      method: "PATCH",
      payload: { enabled: false, startingBlock: "12345679" },
      url: `/v1/integrations/${created.integration.integrationId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ enabled: false, startingBlock: "12345679" });
    await expect(
      integrationRepository.getForTenant(tenantB, created.integration.integrationId),
    ).resolves.toBeNull();
  });

  it("does not accept a request-supplied tenant identifier", async () => {
    const server = buildServer({
      authenticator,
      integrationRepository: new InMemoryIntegrationRepository(),
    });
    servers.add(server);

    const response = await server.inject({
      headers: { authorization: "Bearer tenant-a-admin" },
      method: "POST",
      payload: { ...configuration, tenantId: tenantB },
      url: "/v1/integrations",
    });

    expect(response.statusCode).toBe(400);
  });

  it("isolates list results by the authenticated tenant", async () => {
    const identifiers = [
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ];
    const integrationRepository = new InMemoryIntegrationRepository({
      idGenerator: () => identifiers.shift() ?? "unexpected",
    });
    await integrationRepository.create({
      actorId: "33333333-3333-4333-8333-333333333333",
      configuration: configuration as never,
      tenantId: tenantA,
    });
    const server = buildServer({ authenticator, integrationRepository });
    servers.add(server);

    const response = await server.inject({
      headers: { authorization: "Bearer tenant-b-reader" },
      method: "GET",
      url: "/v1/integrations",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], schemaVersion: "1" });
  });

  it("fails closed when durable persistence is not configured", async () => {
    const server = buildServer({ authenticator });
    servers.add(server);

    const response = await server.inject({
      headers: { authorization: "Bearer tenant-a-reader" },
      method: "GET",
      url: "/v1/integrations",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: "PERSISTENCE_UNAVAILABLE" },
    });
  });
});

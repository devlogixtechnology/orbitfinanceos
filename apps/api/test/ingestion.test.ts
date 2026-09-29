import type { SessionAuthenticator } from "@orbitos/authz";
import type { SessionContext } from "@orbitos/canonical-model";
import { InMemoryIngestionRepository, type IngestionService } from "@orbitos/ingestion-core";
import { InMemoryIntegrationRepository } from "@orbitos/integration-core";
import { afterEach, describe, expect, it } from "vitest";

import { buildServer } from "../src/server.js";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";

function session(tenantId: string, permissions: readonly string[]): SessionContext {
  return {
    actor: { actorId, subject: `password:${tenantId}` },
    authenticatedAt: "2026-09-29T11:00:00.000Z",
    expiresAt: "2026-09-29T19:00:00.000Z",
    permissions: [...permissions],
    roles: ["administrator"],
    schemaVersion: "1",
    tenant: { displayName: `Tenant ${tenantId.slice(0, 4)}`, tenantId },
  };
}

const sessions = new Map([
  ["tenant-a", session(tenantA, ["ingestion:read", "ingestion:write", "integrations:read", "integrations:write", "movements:read"])],
  ["tenant-b", session(tenantB, ["ingestion:read", "integrations:read", "movements:read"])],
]);
const authenticator: SessionAuthenticator = { authenticate: (token) => Promise.resolve(sessions.get(token) ?? null) };
const servers = new Set<ReturnType<typeof buildServer>>();

afterEach(async () => {
  await Promise.all([...servers].map(async (server) => server.close()));
  servers.clear();
});

describe("ingestion and movement API", () => {
  it("runs a bounded exact movement path and isolates it from another tenant", async () => {
    const ids = [
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ];
    const integrations = new InMemoryIntegrationRepository({ idGenerator: () => ids.shift() ?? crypto.randomUUID() });
    const created = await integrations.create({
      actorId,
      configuration: {
        finalityPolicyVersion: "bsc-v1",
        network: { chainId: "97", family: "evm" },
        provider: "bsc-json-rpc",
        providerGroups: [{ endpointReference: "allowlist:testnet", groupId: "primary", independenceGroup: "operator-a" }],
        schemaVersion: "1",
        startingBlock: "1000",
        tokenContracts: ["0x2222222222222222222222222222222222222222"],
        walletAddresses: ["0x1111111111111111111111111111111111111111"],
      },
      tenantId: tenantA,
    });
    const repository = new InMemoryIngestionRepository();
    const ingestionService: IngestionService = {
      listMovements: (tenantId, integrationId) => repository.listMovements(tenantId, integrationId),
      listRuns: (tenantId, integrationId) => repository.listRuns(tenantId, integrationId),
      pause: (tenantId, runId) => repository.setRunState(tenantId, runId, "paused"),
      resume: (tenantId, runId) => repository.setRunState(tenantId, runId, "running"),
      stop: (tenantId, runId) => repository.setRunState(tenantId, runId, "stopped"),
      start: async (command) => {
        const run = await repository.createRun(command);
        return repository.completeBlock({
          blockNumber: command.endBlock,
          movements: [{
            asset: { contractAddress: "0x2222222222222222222222222222222222222222", decimals: 18, metadataSource: "fixture:v1", network: "bsc:97", symbol: "TEST" },
            blockHash: `0x${"b".repeat(64)}`,
            blockNumber: command.endBlock,
            evidenceIds: ["66666666-6666-4666-8666-666666666666"],
            effectiveAt: "1970-01-01T00:00:01.000Z",
            fromAddress: "0x1111111111111111111111111111111111111111",
            integrationId: command.integrationId,
            kind: "bep20_transfer",
            logIndex: "0",
            movementId: "77777777-7777-4777-8777-777777777777",
            network: { chainId: "97", family: "evm" },
            normalizedState: "normalized",
            observedAt: "2026-09-29T12:00:00.000Z",
            observedState: "observed",
            parserVersion: "bsc-bep20-v1",
            quantityAtomic: "340282366920938463463374607431768211455",
            quantityDisplay: "340282366920938463463.374607431768211455",
            schemaVersion: "1",
            tenantId: command.tenantId,
            toAddress: "0x3333333333333333333333333333333333333333",
            transactionHash: `0x${"a".repeat(64)}`,
          }],
          runId: run.runId,
          tenantId: command.tenantId,
        });
      },
    };
    const server = buildServer({ authenticator, ingestionService, integrationRepository: integrations });
    servers.add(server);

    const excessive = await server.inject({
      headers: { authorization: "Bearer tenant-a" },
      method: "POST",
      payload: { endBlock: "3000", schemaVersion: "1" },
      url: `/v1/integrations/${created.integration.integrationId}/runs`,
    });
    expect(excessive.statusCode).toBe(400);
    expect(excessive.json().error).toMatchObject({ code: "INVALID_RANGE" });

    const started = await server.inject({
      headers: { authorization: "Bearer tenant-a" },
      method: "POST",
      payload: { endBlock: "1000", schemaVersion: "1" },
      url: `/v1/integrations/${created.integration.integrationId}/runs`,
    });
    expect(started.statusCode).toBe(201);
    expect(started.json()).toMatchObject({ movementCount: "1", state: "completed" });

    const visible = await server.inject({ headers: { authorization: "Bearer tenant-a" }, method: "GET", url: "/v1/movements" });
    expect(visible.json().data[0]).toMatchObject({
      normalizedState: "normalized",
      quantityAtomic: "340282366920938463463374607431768211455",
      quantityDisplay: "340282366920938463463.374607431768211455",
    });
    const isolated = await server.inject({ headers: { authorization: "Bearer tenant-b" }, method: "GET", url: "/v1/movements" });
    expect(isolated.json()).toEqual({ data: [], schemaVersion: "1" });
  });
});

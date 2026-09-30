import {
  hashPassword,
  InMemoryCustomAuthRepository,
  PasswordSessionService,
} from "@orbitos/authz";
import { InMemoryIntegrationRepository } from "@orbitos/integration-core";
import { InMemoryIngestionRepository, type IngestionService } from "@orbitos/ingestion-core";
import { InMemoryReconciliationQueryService } from "@orbitos/reconciliation-core";
import type { ControlPlaneRepository } from "@orbitos/database";

import { buildServer } from "../../../../api/src/server.js";

const passwordHash = await hashPassword("OrbitOS browser test 2026!");
const authRepository = new InMemoryCustomAuthRepository([
  {
    actorId: "11111111-1111-4111-8111-111111111111",
    email: "orbitos@devlogix.com.pk",
    failedAuthenticationCount: 0,
    lockedUntil: null,
    passwordHash,
    roles: ["super_admin"],
    subject: "password:orbitos@devlogix.com.pk",
    tenantDisplayName: "Devlogix OrbitOS Staging",
    tenantId: "22222222-2222-4222-8222-222222222222",
  },
]);
const sessionService = new PasswordSessionService(authRepository);
const ingestionRepository = new InMemoryIngestionRepository();
const browserIngestionService: IngestionService = {
  listMovements: (tenantId, integrationId) => ingestionRepository.listMovements(tenantId, integrationId),
  listRuns: (tenantId, integrationId) => ingestionRepository.listRuns(tenantId, integrationId),
  pause: (tenantId, runId) => ingestionRepository.setRunState(tenantId, runId, "paused"),
  resume: (tenantId, runId) => ingestionRepository.setRunState(tenantId, runId, "running"),
  stop: (tenantId, runId) => ingestionRepository.setRunState(tenantId, runId, "stopped"),
  start: async (command) => {
    const run = await ingestionRepository.createRun(command);
    await ingestionRepository.setRunState(command.tenantId, run.runId, "running");
    return ingestionRepository.completeBlock({
      blockNumber: command.endBlock,
      movements: [{
        asset: {
          contractAddress: "0x2222222222222222222222222222222222222222",
          decimals: 18,
          metadataSource: "browser-fixture:v1",
          network: "bsc:97",
          symbol: "TEST",
        },
        blockHash: `0x${"b".repeat(64)}`,
        blockNumber: command.endBlock,
        evidenceIds: ["77777777-7777-4777-8777-777777777777"],
        effectiveAt: "1970-01-01T00:00:01.000Z",
        fromAddress: "0x1111111111111111111111111111111111111111",
        integrationId: command.integrationId,
        kind: "bep20_transfer",
        logIndex: "0",
        movementId: crypto.randomUUID(),
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

const tenantId = "22222222-2222-4222-8222-222222222222";
const reconciliationId = "88888888-8888-4888-8888-888888888888";
const exceptionId = "99999999-9999-4999-8999-999999999999";
const reconciliationService = new InMemoryReconciliationQueryService({
  clock: () => new Date("2026-09-29T14:00:00.000Z"),
  exceptions: [{
    affectedResourceId: reconciliationId,
    affectedResourceType: "reconciliation",
    createdAt: "2026-09-29T13:00:00.000Z",
    exceptionId,
    reasonCode: "reconciliation:amount_difference",
    schemaVersion: "1",
    severity: "error",
    stableKey: "browser:amount-difference",
    state: "open",
    tenantId,
    updatedAt: "2026-09-29T13:00:00.000Z",
  }],
  idGenerator: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  results: [{
    assetId: "bsc:97:TEST",
    completedAt: "2026-09-29T13:00:00.000Z",
    cutoff: "2026-09-29T12:59:59.000Z",
    differenceAtomic: "-1",
    exceptionCount: "1",
    excludedMovementIds: [],
    expectedClosingQuantityAtomic: "340282366920938463463374607431768211456",
    feeQuantityAtomic: "0",
    incomingQuantityAtomic: "1",
    observedClosingQuantityAtomic: "340282366920938463463374607431768211455",
    openingQuantityAtomic: "340282366920938463463374607431768211455",
    outgoingQuantityAtomic: "0",
    policyVersion: "bsc-v1",
    reconciliationId,
    schemaVersion: "1",
    state: "mismatched",
    tenantId,
    verifiedMovementIds: [],
    walletAddress: "0x1111111111111111111111111111111111111111",
  }],
});

const controlPlaneRepository: ControlPlaneRepository = {
  createCustomer: () => Promise.reject(new Error("Not used by the browser fixture")),
  createDomain: () => Promise.reject(new Error("Not used by the browser fixture")),
  createInvoice: () => Promise.reject(new Error("Not used by the browser fixture")),
  createRole: () => Promise.reject(new Error("Not used by the browser fixture")),
  createSubscription: () => Promise.reject(new Error("Not used by the browser fixture")),
  createTenant: () => Promise.reject(new Error("Not used by the browser fixture")),
  createUser: () => Promise.reject(new Error("Not used by the browser fixture")),
  provisionWorkspace: () => Promise.reject(new Error("Not used by the browser fixture")),
  snapshot: () => Promise.resolve({
    customers: [{
      createdAt: "2026-09-30T10:00:00.000Z",
      customerId: "44444444-4444-4444-8444-444444444444",
      displayName: "Northstar Trading",
      externalReference: "CUS-001",
      status: "active",
      tenantId,
    }],
    domains: [{
      createdAt: "2026-09-30T10:00:00.000Z",
      domainId: "55555555-5555-4555-8555-555555555555",
      hostname: "devlogix-orbitos.orbitos.devlogix.com.pk",
      kind: "platform_subdomain",
      status: "pending_dns",
      tenantId,
      verificationToken: "fixture-verification-token-2026",
    }],
    invoices: [],
    roles: [],
    schemaVersion: "1",
    subscriptions: [],
    tenants: [{
      createdAt: "2026-09-29T10:00:00.000Z",
      displayName: "Devlogix OrbitOS Staging",
      slug: "devlogix-orbitos",
      status: "active",
      tenantId,
    }],
    users: [{
      actorId: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-09-29T10:00:00.000Z",
      displayName: "OrbitOS Super Administrator",
      email: "orbitos@devlogix.com.pk",
      enabled: true,
      roles: ["super_admin"],
      tenantId,
    }],
  }),
};

const server = buildServer({
  authenticator: sessionService,
  controlPlaneRepository,
  ingestionService: browserIngestionService,
  integrationRepository: new InMemoryIntegrationRepository(),
  reconciliationService,
  sessionService,
});

await server.listen({ host: "127.0.0.1", port: 3100 });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void server.close().finally(() => process.exit(0));
  });
}

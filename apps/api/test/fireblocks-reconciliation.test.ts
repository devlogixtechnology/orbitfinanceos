import { permissionsForRoles, type SessionAuthenticator } from "@orbitos/authz";
import type {
  CsvImport,
  DataConnection,
  FireblocksWallet,
  Integration,
  PositionReconciliation,
  SessionContext,
} from "@orbitos/canonical-model";
import type { DataConnectionRepository } from "@orbitos/database";
import type { DurableEvidenceStore } from "@orbitos/evidence-core";
import type { IntegrationRepository } from "@orbitos/integration-core";
import type { ReconciliationRunner } from "@orbitos/reconciliation-core";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildServer } from "../src/server.js";

const tenantId = "22222222-2222-4222-8222-222222222222";
const customerId = "55555555-5555-4555-8555-555555555555";

const fbConnection: DataConnection = {
  connectionId: "33333333-3333-4333-8333-333333333333",
  createdAt: "2026-09-30T00:00:00.000Z",
  customerId,
  displayName: "Fireblocks Custody",
  hasSecretReference: true,
  provider: "fireblocks",
  publicConfiguration: { workspaceId: "fb-workspace-1" },
  schemaVersion: "1",
  status: "configured",
  tenantId,
};

const bscIntegration: Integration = {
  createdAt: "2026-09-30T00:00:00.000Z",
  customerId,
  enabled: true,
  finalityPolicyVersion: "bsc-confirmations-v1",
  integrationId: "66666666-6666-4666-8666-666666666666",
  network: { chainId: "56", family: "evm" },
  provider: "bsc-json-rpc",
  providerGroups: [],
  schemaVersion: "1",
  startingBlock: "1000",
  tenantId,
  tokenContracts: ["0x55d398326f99059ff775485246999027b3197955"],
  walletAddresses: ["0x28a1c8942b00508a546d0a42426027a0033d5964"],
};

const adminSession: SessionContext = {
  actor: { actorId: "11111111-1111-4111-8111-111111111111", subject: "password:admin@example.com" },
  authenticatedAt: "2026-09-30T00:00:00.000Z",
  expiresAt: "2026-09-30T08:00:00.000Z",
  permissions: [...permissionsForRoles(["tenant_admin"])],
  roles: ["tenant_admin"],
  schemaVersion: "1",
  tenant: { displayName: "Example Company", tenantId },
};

const customerSession: SessionContext = {
  actor: {
    actorId: "77777777-7777-4777-8777-777777777777",
    customerId,
    subject: "password:customer@example.com",
  },
  authenticatedAt: "2026-09-30T00:00:00.000Z",
  expiresAt: "2026-09-30T08:00:00.000Z",
  permissions: [...permissionsForRoles(["user"])],
  roles: ["user"],
  schemaVersion: "1",
  tenant: { displayName: "Example Company", tenantId },
};

const sampleReconciliation: PositionReconciliation = {
  assetId: "bsc:56:native",
  completedAt: "2026-09-30T00:00:00.000Z",
  cutoff: "2026-09-30T00:00:00.000Z",
  customerId,
  differenceAtomic: "0",
  exceptionCount: "0",
  excludedMovementIds: [],
  expectedClosingQuantityAtomic: "2500000000000000000",
  feeQuantityAtomic: "0",
  incomingQuantityAtomic: "2500000000000000000",
  observedClosingQuantityAtomic: "2500000000000000000",
  openingQuantityAtomic: "0",
  outgoingQuantityAtomic: "0",
  policyVersion: "1.0.0",
  reconciliationId: "88888888-8888-4888-8888-888888888888",
  schemaVersion: "1",
  state: "matched",
  tenantId,
  verifiedMovementIds: [],
  walletAddress: "0x28a1c8942b00508a546d0a42426027a0033d5964",
};

const csvImport: CsvImport = {
  byteLength: "80",
  createdAt: "2026-09-30T00:00:00.000Z",
  customerId,
  fileName: "reconciliation.csv",
  importId: "99999999-9999-4999-8999-999999999999",
  objectUri: `evidence://${tenantId}/digest`,
  rowCount: "1",
  schemaVersion: "1",
  sha256: "b".repeat(64),
  status: "preserved",
  tenantId,
};

describe("Fireblocks and CSV reconciliation endpoints", () => {
  const servers = new Set<FastifyInstance>();

  afterEach(async () => {
    for (const server of servers) {
      await server.close();
    }
    servers.clear();
  });

  it("lists Fireblocks vault wallets for customer and admin", async () => {
    const dataConnectionRepo: DataConnectionRepository = {
      configure: vi.fn(),
      deleteCsvImport: vi.fn(() => Promise.resolve(true)),
      list: vi.fn(() => Promise.resolve([fbConnection])),
      listCsvImports: vi.fn(() => Promise.resolve([])),
      recordCsvImport: vi.fn(),
    };
    const integrationRepo: IntegrationRepository = {
      create: vi.fn(),
      getForTenant: vi.fn(() => Promise.resolve(bscIntegration)),
      listForTenant: vi.fn(() => Promise.resolve([bscIntegration])),
      update: vi.fn(),
    };

    const authenticator: SessionAuthenticator = {
      authenticate: (token) => Promise.resolve(token === "admin" ? adminSession : customerSession),
    };

    const server = buildServer({
      authenticator,
      dataConnectionRepository: dataConnectionRepo,
      integrationRepository: integrationRepo,
    });
    servers.add(server);

    const res = await server.inject({
      headers: { authorization: "Bearer customer" },
      method: "GET",
      url: "/v1/data-connections/fireblocks/wallets",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: FireblocksWallet[] };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]?.walletAddress).toBe("0x28a1c8942b00508a546d0a42426027a0033d5964");
    expect(body.data[0]?.customerId).toBe(customerId);
  });

  it("reconciles live Fireblocks wallet balance", async () => {
    const dataConnectionRepo: DataConnectionRepository = {
      configure: vi.fn(),
      deleteCsvImport: vi.fn(() => Promise.resolve(true)),
      list: vi.fn(() => Promise.resolve([fbConnection])),
      listCsvImports: vi.fn(() => Promise.resolve([])),
      recordCsvImport: vi.fn(),
    };
    const integrationRepo: IntegrationRepository = {
      create: vi.fn(),
      getForTenant: vi.fn(() => Promise.resolve(bscIntegration)),
      listForTenant: vi.fn(() => Promise.resolve([bscIntegration])),
      update: vi.fn(),
    };
    const runner: ReconciliationRunner = {
      run: vi.fn(() => Promise.resolve(sampleReconciliation)),
    };

    const authenticator: SessionAuthenticator = {
      authenticate: () => Promise.resolve(customerSession),
    };

    const server = buildServer({
      authenticator,
      dataConnectionRepository: dataConnectionRepo,
      integrationRepository: integrationRepo,
      reconciliationRunner: runner,
    });
    servers.add(server);

    const res = await server.inject({
      headers: { authorization: "Bearer token" },
      method: "POST",
      payload: {
        assetId: "bsc:56:native",
        policyVersion: "1.0.0",
        schemaVersion: "1",
        walletAddress: "0x28a1c8942b00508a546d0a42426027a0033d5964",
      },
      url: "/v1/data-connections/fireblocks/reconcile",
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      customerId,
      state: "matched",
      walletAddress: "0x28a1c8942b00508a546d0a42426027a0033d5964",
    });
    expect(runner.run).toHaveBeenCalledOnce();
  });

  it("triggers CSV reconciliation on preserved CSV upload", async () => {
    const csvContent =
      "wallet_address,asset_id,opening,closing\n0x28a1c8942b00508a546d0a42426027a0033d5964,bsc:56:native,0,2500000000000000000\n";
    const dataConnectionRepo: DataConnectionRepository = {
      configure: vi.fn(),
      deleteCsvImport: vi.fn(() => Promise.resolve(true)),
      list: vi.fn(() => Promise.resolve([fbConnection])),
      listCsvImports: vi.fn(() => Promise.resolve([csvImport])),
      recordCsvImport: vi.fn(),
    };
    const evidenceStore: DurableEvidenceStore = {
      append: vi.fn(),
      checkReadiness: vi.fn(() => Promise.resolve()),
      readByDigest: vi.fn(() => Promise.resolve(new TextEncoder().encode(csvContent))),
      readMetadata: vi.fn(),
      verifyIntegrity: vi.fn(() => Promise.resolve(true)),
    };
    const runner: ReconciliationRunner = {
      run: vi.fn(() => Promise.resolve(sampleReconciliation)),
    };

    const authenticator: SessionAuthenticator = {
      authenticate: () => Promise.resolve(customerSession),
    };

    const server = buildServer({
      authenticator,
      dataConnectionRepository: dataConnectionRepo,
      evidenceStore,
      reconciliationRunner: runner,
    });
    servers.add(server);

    const res = await server.inject({
      headers: { authorization: "Bearer token" },
      method: "POST",
      payload: {},
      url: `/v1/csv-imports/${csvImport.importId}/reconcile`,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { data: PositionReconciliation[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.customerId).toBe(customerId);
    expect(runner.run).toHaveBeenCalledOnce();
  });
});

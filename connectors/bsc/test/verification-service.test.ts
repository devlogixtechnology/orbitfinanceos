import type {
  CanonicalChainMovement,
  Integration,
  VerificationPolicy,
} from "@orbitos/canonical-model";
import type { IngestionService } from "@orbitos/ingestion-core";
import type { IntegrationRepository } from "@orbitos/integration-core";
import {
  InMemoryVerificationDecisionStore,
  InMemoryVerificationPolicyStore,
} from "@orbitos/verification-core";
import { describe, expect, it } from "vitest";

import {
  BscVerificationService,
  BscVerifiedIngestionService,
  type BscVerificationClient,
} from "../src/index.js";

const tenantId = "10000000-0000-4000-8000-000000000001";
const integrationId = "20000000-0000-4000-8000-000000000002";
const movementId = "30000000-0000-4000-8000-000000000003";
const blockHash = `0x${"b".repeat(64)}`;
const transactionHash = `0x${"a".repeat(64)}`;

const movement: CanonicalChainMovement = {
  asset: { metadataSource: "fixture:v1", network: "bsc:97" },
  blockHash,
  blockNumber: "10",
  evidenceIds: ["40000000-0000-4000-8000-000000000004"],
  effectiveAt: "2026-09-29T00:00:00.000Z",
  fromAddress: "0x1111111111111111111111111111111111111111",
  integrationId,
  kind: "native_fee",
  movementId,
  network: { chainId: "97", family: "evm" },
  normalizedState: "normalized",
  observedAt: "2026-09-29T00:00:01.000Z",
  observedState: "observed",
  parserVersion: "bsc-bep20-v1",
  quantityAtomic: "1",
  schemaVersion: "1",
  tenantId,
  transactionHash,
};

const policy: VerificationPolicy = {
  createdAt: "2026-09-29T00:00:00.000Z",
  finalityMode: "finalized_tag",
  minimumIndependentProviders: 2,
  policyId: "50000000-0000-4000-8000-000000000005",
  requireExecution: true,
  requireInclusion: true,
  schemaVersion: "1",
  tenantId,
  version: "bsc-v1",
};

function integration(independenceGroups = ["operator-a", "operator-b"]): Integration {
  return {
    createdAt: "2026-09-29T00:00:00.000Z",
    enabled: true,
    finalityPolicyVersion: "bsc-v1",
    integrationId,
    network: { chainId: "97", family: "evm" },
    provider: "bsc-json-rpc",
    providerGroups: independenceGroups.map((independenceGroup, index) => ({
      groupId: `provider-${index}`,
      hasSecretReference: false,
      independenceGroup,
    })),
    schemaVersion: "1",
    startingBlock: "0",
    tenantId,
    tokenContracts: ["0x2222222222222222222222222222222222222222"],
    walletAddresses: ["0x1111111111111111111111111111111111111111"],
  };
}

class FixtureClient implements BscVerificationClient {
  private callCount = 0;

  constructor(
    readonly providerIdentity: { readonly independenceGroup: string; readonly provider: string },
    private readonly unavailable = false,
    private readonly observedBlockHash = blockHash,
  ) {}

  assertChainIdentity(): Promise<void> {
    return this.unavailable ? Promise.reject(new Error("offline")) : Promise.resolve();
  }

  callWithEvidence(method: string, params: readonly unknown[]) {
    this.callCount += 1;
    const evidenceId = `60000000-0000-4000-8000-00000000000${this.callCount}`;
    if (method === "eth_getTransactionReceipt") {
      return Promise.resolve({
        evidenceId,
        result: {
          blockHash: this.observedBlockHash,
          blockNumber: "0xa",
          gasUsed: "0x1",
          status: "0x1",
          transactionHash,
        },
      });
    }
    const tag = params[0];
    return Promise.resolve({
      evidenceId,
      result: {
        hash: tag === "finalized" ? `0x${"f".repeat(64)}` : this.observedBlockHash,
        number: tag === "finalized" ? "0x64" : "0xa",
        timestamp: "0x1",
      },
    });
  }
}

describe("BSC independent verification", () => {
  it("queries two independent groups and verifies all mandatory dimensions", async () => {
    const store = new InMemoryVerificationDecisionStore();
    const service = new BscVerificationService(
      (_configured, group) => new FixtureClient({ independenceGroup: group.independenceGroup, provider: group.groupId }),
      store,
      {
        clock: () => new Date("2026-09-29T00:02:00.000Z"),
        idGenerator: () => "70000000-0000-4000-8000-000000000007",
      },
    );

    const result = await service.verify({ integration: integration(), movement, policy });
    expect(result).toMatchObject({
      agreement: "agreed",
      execution: "succeeded",
      finality: "final",
      inclusion: "included",
      verification: "verified",
    });
    expect(result.observations.map((item) => item.independenceGroup)).toEqual(["operator-a", "operator-b"]);
    await expect(store.listForMovement(tenantId, movementId)).resolves.toHaveLength(1);
  });

  it("degrades instead of fabricating success when the second group is unavailable", async () => {
    const store = new InMemoryVerificationDecisionStore();
    const service = new BscVerificationService(
      (_configured, group) => new FixtureClient(
        { independenceGroup: group.independenceGroup, provider: group.groupId },
        group.independenceGroup === "operator-b",
      ),
      store,
      {
        clock: () => new Date("2026-09-29T00:02:00.000Z"),
        idGenerator: () => "80000000-0000-4000-8000-000000000008",
      },
    );

    const result = await service.verify({ integration: integration(), movement, policy });
    expect(result.verification).toBe("degraded");
    expect(result.reasonCodes).toContain("verification:provider_unavailable");
    const repeated = await service.verify({
      integration: integration(),
      movement,
      policy,
      previousDecision: result,
    });
    expect(repeated.decisionId).toBe(result.decisionId);
    await expect(store.listForMovement(tenantId, movementId)).resolves.toHaveLength(1);
  });

  it("does not count two endpoints operated by one independence group as quorum", async () => {
    const service = new BscVerificationService(
      (_configured, group) => new FixtureClient({ independenceGroup: group.independenceGroup, provider: group.groupId }),
      new InMemoryVerificationDecisionStore(),
      {
        clock: () => new Date("2026-09-29T00:02:00.000Z"),
        idGenerator: () => "90000000-0000-4000-8000-000000000009",
      },
    );

    const result = await service.verify({
      integration: integration(["operator-a", "operator-a"]),
      movement,
      policy,
    });
    expect(result.verification).toBe("pending");
    expect(result.reasonCodes).toContain("verification:quorum_pending");
  });

  it("runs verification automatically after a completed ingestion run", async () => {
    const configuredIntegration = integration();
    const integrations: IntegrationRepository = {
      create: () => Promise.reject(new Error("not used")),
      getForTenant: (requestedTenantId, requestedIntegrationId) => Promise.resolve(
        requestedTenantId === tenantId && requestedIntegrationId === integrationId
          ? configuredIntegration
          : null,
      ),
      listForTenant: () => Promise.resolve([configuredIntegration]),
      update: () => Promise.reject(new Error("not used")),
    };
    const ingestion: IngestionService = {
      listMovements: () => Promise.resolve([movement]),
      listRuns: () => Promise.resolve([]),
      pause: () => Promise.resolve(null),
      resume: () => Promise.resolve(null),
      start: (command) => Promise.resolve({
        completedAt: "2026-09-29T00:01:00.000Z",
        endBlock: command.endBlock,
        integrationId: command.integrationId,
        movementCount: "1",
        quarantineCount: "0",
        runId: "a0000000-0000-4000-8000-00000000000a",
        schemaVersion: "1",
        startedAt: "2026-09-29T00:00:00.000Z",
        startBlock: command.startBlock,
        state: "completed",
        tenantId: command.tenantId,
      }),
      stop: () => Promise.resolve(null),
    };
    const store = new InMemoryVerificationDecisionStore();
    const verifier = new BscVerificationService(
      (_configured, group) => new FixtureClient({ independenceGroup: group.independenceGroup, provider: group.groupId }),
      store,
      {
        clock: () => new Date("2026-09-29T00:02:00.000Z"),
        idGenerator: () => "b0000000-0000-4000-8000-00000000000b",
      },
    );
    const service = new BscVerifiedIngestionService(
      ingestion,
      integrations,
      new InMemoryVerificationPolicyStore([policy]),
      verifier,
      store,
    );

    await service.start({ endBlock: "10", integrationId, startBlock: "10", tenantId });
    await expect(store.listForMovement(tenantId, movementId)).resolves.toEqual([
      expect.objectContaining({ verification: "verified" }),
    ]);
  });

  it("invalidates a prior verified branch when providers report a changed canonical block", async () => {
    const store = new InMemoryVerificationDecisionStore();
    const initial = new BscVerificationService(
      (_configured, group) => new FixtureClient({ independenceGroup: group.independenceGroup, provider: group.groupId }),
      store,
      {
        clock: () => new Date("2026-09-29T00:02:00.000Z"),
        idGenerator: () => "c0000000-0000-4000-8000-00000000000c",
      },
    );
    const verified = await initial.verify({ integration: integration(), movement, policy });
    const changedHash = `0x${"c".repeat(64)}`;
    let exceptionDecision: string | undefined;
    const recheck = new BscVerificationService(
      (_configured, group) => new FixtureClient(
        { independenceGroup: group.independenceGroup, provider: group.groupId },
        false,
        changedHash,
      ),
      store,
      {
        clock: () => new Date("2026-09-29T00:03:00.000Z"),
        idGenerator: () => "d0000000-0000-4000-8000-00000000000d",
        onConflict: (decision) => {
          exceptionDecision = decision.verification;
          return Promise.resolve();
        },
      },
    );

    const invalidated = await recheck.verify({
      integration: integration(),
      movement,
      policy,
      previousDecision: verified,
    });
    expect(invalidated).toMatchObject({
      finality: "orphaned",
      supersedesDecisionId: verified.decisionId,
      verification: "invalidated",
    });
    expect(exceptionDecision).toBe("invalidated");
    await expect(store.listForMovement(tenantId, movementId)).resolves.toHaveLength(2);
  });
});

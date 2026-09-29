import type { CanonicalChainMovement, VerificationDecision } from "@orbitos/canonical-model";
import type { IngestionService } from "@orbitos/ingestion-core";
import { InMemoryVerificationDecisionStore } from "@orbitos/verification-core";
import { describe, expect, it } from "vitest";

import {
  deduplicateExceptions,
  applyReorganizationInvalidations,
  ExactReconciliationRunner,
  InMemoryReconciliationQueryService,
  reconcilePosition,
  resolveReorganization,
  type PositionChange,
} from "../src/index.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const walletAddress = "0x1111111111111111111111111111111111111111";
const assetId = "bsc:56:0x2222222222222222222222222222222222222222";

function decision(
  verification: VerificationDecision["verification"],
  decisionId: string,
): VerificationDecision {
  return {
    agreement: verification === "verified" ? "agreed" : "pending",
    decidedAt: "2026-09-29T01:00:00.000Z",
    decisionId,
    evidenceIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    execution: verification === "verified" ? "succeeded" : "unknown",
    finality: verification === "verified" ? "final" : "pending",
    inclusion: verification === "verified" ? "included" : "pending",
    movementId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    observations: [{
      agreementKey: "anchor",
      evidenceIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      execution: verification === "verified" ? "succeeded" : "unknown",
      finality: verification === "verified" ? "final" : "pending",
      inclusion: verification === "verified" ? "included" : "pending",
      independenceGroup: "operator-a",
      observedAt: "2026-09-29T00:59:00.000Z",
      provider: "provider-a",
      status: "available",
    }],
    policyId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    policyVersion: "bsc-v1",
    reasonCodes: [verification === "verified" ? "verification:verified" : "verification:quorum_pending"],
    schemaVersion: "1",
    tenantId,
    verification,
  };
}

function change(
  movementId: string,
  direction: PositionChange["direction"],
  quantityAtomic: string,
  verification: VerificationDecision["verification"] = "verified",
): PositionChange {
  return {
    assetId,
    direction,
    effectiveAt: "2026-09-29T00:00:00.000Z",
    movementId,
    quantityAtomic,
    verificationDecision: decision(verification, movementId),
    walletAddress,
  };
}

describe("exact reconciliation", () => {
  it("matches an independent exact-integer roll-forward oracle", () => {
    const opening = "340282366920938463463374607431768211455";
    const result = reconcilePosition({
      assetId,
      changes: [
        change("10000000-0000-4000-8000-000000000001", "incoming", "100000000000000000001"),
        change("10000000-0000-4000-8000-000000000002", "outgoing", "17"),
        change("10000000-0000-4000-8000-000000000003", "fee", "3"),
      ],
      cutoff: "2026-09-29T23:59:59.000Z",
      observedClosingQuantityAtomic: (BigInt(opening) + 100000000000000000001n - 17n - 3n).toString(),
      openingQuantityAtomic: opening,
      tenantId,
      walletAddress,
    });

    expect(result.state).toBe("matched");
    expect(result.differenceAtomic).toBe("0");
    expect(result.expectedClosingQuantityAtomic).toBe("340282366920938463563374607431768211436");
  });

  it("never counts pending, degraded, or conflicted movements as verified facts", () => {
    const result = reconcilePosition({
      assetId,
      changes: [
        change("20000000-0000-4000-8000-000000000001", "incoming", "10", "pending"),
        change("20000000-0000-4000-8000-000000000002", "incoming", "20", "degraded"),
        change("20000000-0000-4000-8000-000000000003", "incoming", "30", "conflicted"),
      ],
      cutoff: "2026-09-29T23:59:59.000Z",
      observedClosingQuantityAtomic: "5",
      openingQuantityAtomic: "5",
      tenantId,
      walletAddress,
    });

    expect(result.expectedClosingQuantityAtomic).toBe("5");
    expect(result.excludedMovementIds).toHaveLength(3);
    expect(result.exceptions).toEqual([expect.objectContaining({ reason: "verification_incomplete" })]);
  });

  it("deduplicates rerun exceptions by a stable scope key", () => {
    const run = reconcilePosition({
      assetId,
      changes: [change("30000000-0000-4000-8000-000000000001", "incoming", "10")],
      cutoff: "2026-09-29T23:59:59.000Z",
      observedClosingQuantityAtomic: "0",
      openingQuantityAtomic: "0",
      tenantId,
      walletAddress,
    });

    expect(deduplicateExceptions(run.exceptions, run.exceptions)).toHaveLength(1);
  });

  it("preserves the old branch while rebuilding the new branch without double counting", () => {
    const result = resolveReorganization(
      [{ blockHash: "0xold", blockNumber: "100", movementIds: ["old-movement"] }],
      [{ blockHash: "0xnew", blockNumber: "100", movementIds: ["new-movement", "new-movement"] }],
    );

    expect(result.changedBlockNumbers).toEqual(["100"]);
    expect(result.invalidatedMovementIds).toEqual(["old-movement"]);
    expect(result.currentCanonicalMovementIds).toEqual(["new-movement"]);
    expect(result.preservedOldBranch).toHaveLength(1);
  });

  it("runs and records an idempotent exact reconciliation from verified movement history", async () => {
    const movementId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const movement: CanonicalChainMovement = {
      asset: {
        contractAddress: "0x2222222222222222222222222222222222222222",
        metadataSource: "fixture:v1",
        network: "bsc:56",
      },
      blockHash: `0x${"b".repeat(64)}`,
      blockNumber: "10",
      effectiveAt: "2026-09-29T00:00:00.000Z",
      evidenceIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      fromAddress: "0x3333333333333333333333333333333333333333",
      integrationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      kind: "bep20_transfer",
      logIndex: "0",
      movementId,
      network: { chainId: "56", family: "evm" },
      normalizedState: "normalized",
      observedAt: "2026-09-29T00:00:01.000Z",
      observedState: "observed",
      parserVersion: "fixture:v1",
      quantityAtomic: "10",
      schemaVersion: "1",
      tenantId,
      toAddress: walletAddress,
      transactionHash: `0x${"a".repeat(64)}`,
    };
    const ingestion: IngestionService = {
      listMovements: () => Promise.resolve([movement]),
      listRuns: () => Promise.resolve([]),
      pause: () => Promise.resolve(null),
      resume: () => Promise.resolve(null),
      start: () => Promise.reject(new Error("not used")),
      stop: () => Promise.resolve(null),
    };
    const decisions = new InMemoryVerificationDecisionStore();
    await decisions.append(decision("verified", "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"));
    const repository = new InMemoryReconciliationQueryService();
    const ids = [
      "f0000000-0000-4000-8000-000000000001",
      "f0000000-0000-4000-8000-000000000002",
      "f0000000-0000-4000-8000-000000000003",
    ];
    const runner = new ExactReconciliationRunner(ingestion, decisions, repository, {
      clock: () => new Date("2026-09-29T02:00:00.000Z"),
      idGenerator: () => ids.shift() ?? crypto.randomUUID(),
    });
    const command = {
      request: {
        assetId,
        cutoff: "2026-09-29T01:00:00.000Z",
        observedClosingQuantityAtomic: "10",
        openingQuantityAtomic: "0",
        policyVersion: "bsc-v1",
        schemaVersion: "1" as const,
        walletAddress,
      },
      tenantId,
    };

    const first = await runner.run(command);
    const second = await runner.run(command);
    expect(first).toMatchObject({ expectedClosingQuantityAtomic: "10", state: "matched" });
    expect(second.reconciliationId).toBe(first.reconciliationId);
    await expect(repository.listResults(tenantId)).resolves.toHaveLength(1);
  });

  it("appends an invalidation after a reorg without mutating the verified decision", async () => {
    const store = new InMemoryVerificationDecisionStore();
    const prior = decision("verified", "d0000000-0000-4000-8000-00000000000d");
    await store.append(prior);
    const invalidations = await applyReorganizationInvalidations(
      tenantId,
      {
        changedBlockNumbers: ["10"],
        currentCanonicalMovementIds: ["new-movement"],
        invalidatedMovementIds: [prior.movementId],
        preservedOldBranch: [{ blockHash: "0xold", blockNumber: "10", movementIds: [prior.movementId] }],
      },
      store,
      {
        clock: () => new Date("2026-09-29T03:00:00.000Z"),
        idGenerator: () => "e0000000-0000-4000-8000-00000000000e",
      },
    );
    expect(invalidations).toEqual([expect.objectContaining({
      finality: "orphaned",
      supersedesDecisionId: prior.decisionId,
      verification: "invalidated",
    })]);
    const history = await store.listForMovement(tenantId, prior.movementId);
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual(prior);
  });

  it("surfaces a movement with no verification decision as excluded work", async () => {
    const movement: CanonicalChainMovement = {
      asset: { contractAddress: "0x2222222222222222222222222222222222222222", metadataSource: "fixture:v1", network: "bsc:56" },
      blockHash: `0x${"b".repeat(64)}`,
      blockNumber: "10",
      effectiveAt: "2026-09-29T00:00:00.000Z",
      evidenceIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      fromAddress: "0x3333333333333333333333333333333333333333",
      integrationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      kind: "bep20_transfer",
      logIndex: "0",
      movementId: "c0000000-0000-4000-8000-00000000000c",
      network: { chainId: "56", family: "evm" },
      normalizedState: "normalized",
      observedAt: "2026-09-29T00:00:01.000Z",
      observedState: "observed",
      parserVersion: "fixture:v1",
      quantityAtomic: "10",
      schemaVersion: "1",
      tenantId,
      toAddress: walletAddress,
      transactionHash: `0x${"a".repeat(64)}`,
    };
    const ingestion: IngestionService = {
      listMovements: () => Promise.resolve([movement]),
      listRuns: () => Promise.resolve([]),
      pause: () => Promise.resolve(null), resume: () => Promise.resolve(null),
      start: () => Promise.reject(new Error("not used")), stop: () => Promise.resolve(null),
    };
    const repository = new InMemoryReconciliationQueryService();
    const runner = new ExactReconciliationRunner(
      ingestion,
      new InMemoryVerificationDecisionStore(),
      repository,
      {
        clock: () => new Date("2026-09-29T04:00:00.000Z"),
        idGenerator: (() => {
          const ids = ["d0000000-0000-4000-8000-00000000000d", "e0000000-0000-4000-8000-00000000000e"];
          return () => ids.shift() ?? crypto.randomUUID();
        })(),
      },
    );
    const result = await runner.run({
      request: {
        assetId,
        cutoff: "2026-09-29T01:00:00.000Z",
        openingQuantityAtomic: "0",
        policyVersion: "bsc-v1",
        schemaVersion: "1",
        walletAddress,
      },
      tenantId,
    });
    expect(result.excludedMovementIds).toEqual([movement.movementId]);
    expect(result.exceptionCount).toBe("1");
    await expect(repository.listExceptions(tenantId)).resolves.toEqual([
      expect.objectContaining({ reasonCode: "reconciliation:verification_incomplete" }),
    ]);
  });
});

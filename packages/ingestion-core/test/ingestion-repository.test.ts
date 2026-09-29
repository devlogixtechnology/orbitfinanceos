import { describe, expect, it } from "vitest";

import { InMemoryIngestionRepository } from "../src/index.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const integrationId = "22222222-2222-4222-8222-222222222222";

describe("checkpointed ingestion repository", () => {
  it("deduplicates replayed natural movement identities and advances checkpoints", async () => {
    let id = 3;
    const repository = new InMemoryIngestionRepository({
      clock: () => new Date("2026-09-29T12:00:00.000Z"),
      idGenerator: () => `${id++}`.padStart(8, "0") + "-0000-4000-8000-000000000000",
    });
    const run = await repository.createRun({ endBlock: "11", integrationId, startBlock: "10", tenantId });
    const movement = {
      asset: { contractAddress: `0x${"c".repeat(40)}`, decimals: 18, metadataSource: "fixture:v1", network: "bsc:97", symbol: "TEST" },
      blockHash: `0x${"b".repeat(64)}`,
      blockNumber: "10",
      evidenceIds: ["44444444-4444-4444-8444-444444444444"],
      effectiveAt: "1970-01-01T00:00:01.000Z",
      fromAddress: `0x${"1".repeat(40)}`,
      integrationId,
      kind: "bep20_transfer" as const,
      logIndex: "0",
      movementId: "55555555-5555-4555-8555-555555555555",
      network: { chainId: "97" as const, family: "evm" as const },
      normalizedState: "normalized" as const,
      observedAt: "2026-09-29T12:00:00.000Z",
      observedState: "observed" as const,
      parserVersion: "bsc-bep20-v1",
      quantityAtomic: "340282366920938463463374607431768211455",
      quantityDisplay: "340282366920938463463.374607431768211455",
      schemaVersion: "1" as const,
      tenantId,
      toAddress: `0x${"2".repeat(40)}`,
      transactionHash: `0x${"a".repeat(64)}`,
    };
    const first = await repository.completeBlock({ blockNumber: "10", movements: [movement], runId: run.runId, tenantId });
    const replay = await repository.completeBlock({ blockNumber: "10", movements: [{ ...movement, movementId: "66666666-6666-4666-8666-666666666666" }], runId: run.runId, tenantId });

    expect(first.checkpointBlock).toBe("10");
    expect(replay.movementCount).toBe("1");
    await repository.completeBlock({ blockNumber: "11", movements: [], runId: run.runId, tenantId });
    expect((await repository.getRun(tenantId, run.runId))?.state).toBe("completed");
  });

  it("enforces exclusive expiring leases and preserves the checkpoint when quarantining", async () => {
    let now = new Date("2026-09-29T12:00:00.000Z");
    const repository = new InMemoryIngestionRepository({ clock: () => now });
    const run = await repository.createRun({ endBlock: "10", integrationId, startBlock: "10", tenantId });
    const lease = await repository.acquireLease(tenantId, run.runId, "worker-a", 30_000);
    expect(lease).not.toBeNull();
    await expect(repository.acquireLease(tenantId, run.runId, "worker-b", 30_000)).resolves.toBeNull();
    await expect(repository.renewLease(tenantId, run.runId, "wrong-token", 30_000)).resolves.toBeNull();
    now = new Date("2026-09-29T12:00:10.000Z");
    await expect(repository.renewLease(tenantId, run.runId, lease?.token ?? "", 30_000)).resolves.toEqual({
      expiresAt: "2026-09-29T12:00:40.000Z",
    });
    await repository.quarantine({
      blockNumber: "10",
      evidenceIds: ["77777777-7777-4777-8777-777777777777"],
      integrationId,
      reasonCode: "ingestion:malformed_response",
      runId: run.runId,
      tenantId,
    });
    const failed = await repository.getRun(tenantId, run.runId);
    expect(failed).toMatchObject({ quarantineCount: "1", state: "failed" });
    expect(failed?.checkpointBlock).toBeUndefined();
    await expect(repository.releaseLease(tenantId, run.runId, lease?.token ?? "")).resolves.toBe(true);
  });
});

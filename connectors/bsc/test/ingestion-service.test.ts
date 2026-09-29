import { InMemoryIngestionRepository } from "@orbitos/ingestion-core";
import { InMemoryIntegrationRepository } from "@orbitos/integration-core";
import { describe, expect, it } from "vitest";

import {
  BscIngestionService,
  RpcTransportError,
  bep20TransferTopic,
  type BscJsonRpcClient,
  type RpcCallResult,
} from "../src/index.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const integrationId = "22222222-2222-4222-8222-222222222222";
const wallet = `0x${"1".repeat(40)}`;
const recipient = `0x${"2".repeat(40)}`;
const token = `0x${"c".repeat(40)}`;
const transactionHash = `0x${"a".repeat(64)}`;
const blockHash = `0x${"b".repeat(64)}`;

function topic(address: string): string {
  return `0x${"0".repeat(24)}${address.slice(2)}`;
}

function evidence(index: number, result: unknown): RpcCallResult {
  return {
    evidenceId: `${index.toString().padStart(8, "0")}-0000-4000-8000-000000000000`,
    result,
  };
}

describe("BSC ingestion orchestration", () => {
  it("falls back to an independent provider and replays without duplicate movements", async () => {
    const integrations = new InMemoryIntegrationRepository({
      idGenerator: (() => {
        const ids = [integrationId, "33333333-3333-4333-8333-333333333333"];
        return () => ids.shift() ?? crypto.randomUUID();
      })(),
    });
    await integrations.create({
      actorId: "44444444-4444-4444-8444-444444444444",
      configuration: {
        finalityPolicyVersion: "bsc-confirmations-v1",
        network: { chainId: "97", family: "evm" },
        provider: "bsc-json-rpc",
        providerGroups: [
          { endpointReference: "allowlist:primary", groupId: "primary", independenceGroup: "operator-a" },
          { endpointReference: "allowlist:fallback", groupId: "fallback", independenceGroup: "operator-b" },
        ],
        schemaVersion: "1",
        startingBlock: "16",
        tokenContracts: [token],
        walletAddresses: [wallet],
      },
      tenantId,
    });
    const repository = new InMemoryIngestionRepository();
    let primaryLogAttempts = 0;
    let fallbackLogAttempts = 0;
    const service = new BscIngestionService(
      integrations,
      repository,
      (_integration, group) => {
        const fake = {
          assertChainIdentity: () => Promise.resolve(),
          callWithEvidence: (method: string): Promise<RpcCallResult> => {
            if (method === "eth_call") {
              return Promise.resolve(evidence(1, `0x${"0".repeat(63)}6`));
            }
            if (method === "eth_getLogs" && group.groupId === "primary") {
              primaryLogAttempts += 1;
              return Promise.reject(new RpcTransportError("primary unavailable"));
            }
            if (method === "eth_getLogs") {
              fallbackLogAttempts += 1;
              return Promise.resolve(evidence(2, [{
                address: token,
                blockHash,
                blockNumber: "0x10",
                data: `0x${"0".repeat(62)}64`,
                logIndex: "0x0",
                topics: [bep20TransferTopic, topic(wallet), topic(recipient)],
                transactionHash,
              }]));
            }
            if (method === "eth_getBlockByNumber") {
              return Promise.resolve(evidence(3, { hash: blockHash, number: "0x10", timestamp: "0x1" }));
            }
            if (method === "eth_getTransactionReceipt") {
              return Promise.resolve(evidence(4, {
                effectiveGasPrice: "0x1",
                gasPayer: wallet,
                gasUsed: "0x5208",
                status: "0x1",
                transactionHash,
              }));
            }
            if (method === "eth_getTransactionByHash") {
              return Promise.resolve(evidence(5, { from: wallet, gasPrice: "0x1", hash: transactionHash }));
            }
            return Promise.reject(new Error(`Unexpected method ${method}`));
          },
        };
        return fake as unknown as BscJsonRpcClient;
      },
      () => new Date("2026-09-29T12:00:00.000Z"),
    );

    const first = await service.start({ endBlock: "16", integrationId, startBlock: "16", tenantId });
    const replay = await service.start({ endBlock: "16", integrationId, startBlock: "16", tenantId });
    const movements = await service.listMovements(tenantId, integrationId);

    expect(first.state).toBe("completed");
    expect(replay.state).toBe("completed");
    expect(movements).toHaveLength(2);
    expect(movements.map((item) => item.kind).sort()).toEqual(["bep20_transfer", "native_fee"]);
    expect(primaryLogAttempts).toBe(2);
    expect(fallbackLogAttempts).toBe(2);
  });
});

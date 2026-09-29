import { describe, expect, it } from "vitest";

import { bep20TransferTopic, normalizeBscTransaction } from "../src/index.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const integrationId = "22222222-2222-4222-8222-222222222222";
const evidenceIds = [
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];
const transactionHash = `0x${"a".repeat(64)}`;
const blockHash = `0x${"b".repeat(64)}`;
const token = `0x${"c".repeat(40)}`;
const from = `0x${"1".repeat(40)}`;
const to = `0x${"2".repeat(40)}`;
const zero = `0x${"0".repeat(40)}`;

function topic(address: string): string {
  return `0x${"0".repeat(24)}${address.slice(2)}`;
}

function log(index: number, value: bigint, fromAddress = from, toAddress = to) {
  return {
    address: token,
    blockHash,
    blockNumber: "0x10",
    data: `0x${value.toString(16).padStart(64, "0")}`,
    logIndex: `0x${index.toString(16)}`,
    topics: [bep20TransferTopic, topic(fromAddress), topic(toAddress)],
    transactionHash,
  };
}

function normalize(logs: readonly unknown[], status: "0x0" | "0x1" = "0x1") {
  let id = 5;
  return normalizeBscTransaction({
    block: { hash: blockHash, number: "0x10", timestamp: "0x1" },
    chainId: "97",
    evidenceIds,
    idGenerator: () => `${id++}`.padStart(8, "0") + "-0000-4000-8000-000000000000",
    integrationId,
    logs,
    observedAt: "2026-09-29T12:00:00.000Z",
    receipt: {
      effectiveGasPrice: "0x3b9aca00",
      gasPayer: from,
      gasUsed: "0x5208",
      status,
      transactionHash,
    },
    tenantId,
    tokenMetadata: {
      [token]: { decimals: 18, source: "fixture:v1", symbol: "TEST" },
    },
    transaction: { from: to, gasPrice: "0x1", hash: transactionHash },
  });
}

describe("BEP-20 and native-fee normalization", () => {
  it("preserves multiple logs, zero values, mint/burn shape, and exact large integers", () => {
    const maximum = (1n << 256n) - 1n;
    const movements = normalize([
      log(0, 0n),
      log(1, 1n, zero, to),
      log(2, 2n, from, zero),
      log(3, maximum),
    ]);

    expect(movements).toHaveLength(5);
    expect(movements.slice(0, 4).map((item) => item.logIndex)).toEqual(["0", "1", "2", "3"]);
    expect(movements[0]?.quantityAtomic).toBe("0");
    expect(movements[1]?.fromAddress).toBe(zero);
    expect(movements[2]?.toAddress).toBe(zero);
    expect(movements[3]?.quantityAtomic).toBe(maximum.toString());
    expect(movements[4]).toMatchObject({
      feePayerSource: "receipt",
      fromAddress: from,
      kind: "native_fee",
      quantityAtomic: "21000000000000",
    });
  });

  it("suppresses successful transfer creation for a failed transaction while retaining the fee", () => {
    const movements = normalize([log(0, 1n)], "0x0");
    expect(movements).toHaveLength(1);
    expect(movements[0]?.kind).toBe("native_fee");
  });

  it("rejects receipt and transaction identity disagreement", () => {
    expect(() => normalizeBscTransaction({
      block: { hash: blockHash, number: "0x10", timestamp: "0x1" },
      chainId: "97",
      evidenceIds,
      integrationId,
      logs: [],
      observedAt: "2026-09-29T12:00:00.000Z",
      receipt: { gasUsed: "0x0", status: "0x1", transactionHash },
      tenantId,
      transaction: { from, hash: `0x${"d".repeat(64)}` },
    })).toThrow("identities disagree");
  });
});

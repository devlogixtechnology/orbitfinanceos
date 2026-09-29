import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  BscJsonRpcClient,
  RpcPayloadError,
  UnexpectedChainIdentityError,
  type RawRpcEvidence,
} from "../src/index.js";

const fixtureUrl = new URL(
  "./fixtures/bsc-golden-fixtures.json",
  import.meta.url,
);

function createClient(
  responses: Response[],
  captured: RawRpcEvidence[],
  events: string[] = [],
  delays: number[] = [],
): BscJsonRpcClient {
  const identifiers = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
  ];
  return new BscJsonRpcClient({
    authorizationHeader: "Bearer never-persist-this",
    clock: () => new Date("2026-09-28T04:00:00.000Z"),
    endpoint: "https://rpc.invalid.example",
    evidenceSink: {
      append: (evidence) => {
        events.push("evidence");
        captured.push(evidence);
        return Promise.resolve();
      },
    },
    fetchImplementation: () =>
      Promise.resolve(
        responses.shift() ?? new Response("missing fixture", { status: 500 }),
      ),
    idGenerator: () => identifiers.shift() ?? crypto.randomUUID(),
    independenceGroup: "operator-a",
    integrationId: "55555555-5555-4555-8555-555555555555",
    maxAttempts: 2,
    provider: "synthetic-provider-a",
    sleeper: (milliseconds) => {
      delays.push(milliseconds);
      return Promise.resolve();
    },
    tenantId: "66666666-6666-4666-8666-666666666666",
  });
}

describe("BSC JSON-RPC evidence boundary", () => {
  it("persists exact response bytes before validating the payload", async () => {
    const captured: RawRpcEvidence[] = [];
    const events: string[] = [];
    const client = createClient(
      [new Response("not-json", { status: 200 })],
      captured,
      events,
    );

    await expect(client.call("eth_chainId", [])).rejects.toThrow(RpcPayloadError);

    expect(events).toEqual(["evidence"]);
    expect(new TextDecoder().decode(captured[0]?.rawBytes)).toBe("not-json");
    expect(JSON.stringify(captured)).not.toContain("never-persist-this");
  });

  it.each([
    ["56" as const, "0x38"],
    ["97" as const, "0x61"],
  ])("accepts BSC chain %s and rejects a mismatched identity", async (chainId, encodedChainId) => {
    const accepted = createClient(
      [
        new Response(
          JSON.stringify({ id: "request", jsonrpc: "2.0", result: encodedChainId }),
        ),
      ],
      [],
    );
    await expect(accepted.assertChainIdentity(chainId)).resolves.toBeUndefined();

    const rejected = createClient(
      [
        new Response(
          JSON.stringify({ id: "request", jsonrpc: "2.0", result: "0x1" }),
        ),
      ],
      [],
    );
    await expect(rejected.assertChainIdentity(chainId)).rejects.toThrow(
      UnexpectedChainIdentityError,
    );
  });

  it("retries bounded transient HTTP failures and preserves each response", async () => {
    const captured: RawRpcEvidence[] = [];
    const client = createClient(
      [
        new Response("temporarily unavailable", { status: 503 }),
        new Response(
          JSON.stringify({ id: "request", jsonrpc: "2.0", result: "0x38" }),
        ),
      ],
      captured,
    );

    await expect(client.assertChainIdentity("56")).resolves.toBeUndefined();
    expect(captured).toHaveLength(2);
  });

  it("honors a bounded Retry-After delay when a provider rate-limits", async () => {
    const delays: number[] = [];
    const client = createClient(
      [
        new Response("rate limited", { headers: { "retry-after": "3" }, status: 429 }),
        new Response(
          JSON.stringify({ id: "request", jsonrpc: "2.0", result: "0x38" }),
        ),
      ],
      [],
      [],
      delays,
    );

    await expect(client.assertChainIdentity("56")).resolves.toBeUndefined();
    expect(delays).toEqual([3_000]);
  });

  it("retries a bounded transient provider error and preserves each response", async () => {
    const captured: RawRpcEvidence[] = [];
    const client = createClient(
      [
        new Response(
          JSON.stringify({
            error: { code: 19, message: "temporary internal error" },
            id: "request",
            jsonrpc: "2.0",
          }),
        ),
        new Response(
          JSON.stringify({ id: "request", jsonrpc: "2.0", result: "0x38" }),
        ),
      ],
      captured,
    );

    await expect(client.assertChainIdentity("56")).resolves.toBeUndefined();
    expect(captured).toHaveLength(2);
  });

  it("contains the complete named Sprint 1 golden-fixture set", async () => {
    const fixture = JSON.parse(
      await readFile(fileURLToPath(fixtureUrl), "utf8"),
    ) as { cases: Array<{ name: string }> };

    expect(fixture.cases.map((item) => item.name)).toEqual([
      "normal-transfer",
      "multiple-transfer-logs",
      "zero-value-transfer",
      "mint-shaped-transfer",
      "burn-shaped-transfer",
      "failed-transaction",
      "duplicate-response",
      "out-of-order-response",
      "malformed-response",
      "very-large-exact-amount",
    ]);
  });
});

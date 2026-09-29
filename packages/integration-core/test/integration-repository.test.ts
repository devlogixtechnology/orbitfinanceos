import { describe, expect, it } from "vitest";

import { InMemoryIntegrationRepository } from "../src/index.js";

const configuration = {
  finalityPolicyVersion: "bsc-finality-v1",
  network: { chainId: "97" as const, family: "evm" as const },
  provider: "bsc-json-rpc" as const,
  providerGroups: [
    {
      endpointReference: "secret://bsc-testnet/provider-a/endpoint",
      groupId: "provider-a",
      independenceGroup: "operator-a",
      secretReference: "secret://bsc-testnet/provider-a/token",
    },
  ],
  schemaVersion: "1" as const,
  startingBlock: "12345678",
  tokenContracts: ["0x2222222222222222222222222222222222222222"],
  walletAddresses: ["0x1111111111111111111111111111111111111111"],
};

describe("integration repository boundary", () => {
  it("returns public configuration without secret or endpoint references", async () => {
    const identifiers = [
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ];
    const repository = new InMemoryIntegrationRepository({
      clock: () => new Date("2026-09-28T04:00:00.000Z"),
      idGenerator: () => identifiers.shift() ?? "unexpected",
    });

    const result = await repository.create({
      actorId: "55555555-5555-4555-8555-555555555555",
      configuration,
      tenantId: "11111111-1111-4111-8111-111111111111",
    });

    expect(result.integration.providerGroups).toEqual([
      {
        groupId: "provider-a",
        hasSecretReference: true,
        independenceGroup: "operator-a",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("secret://");
    expect(result.auditEvent.action).toBe("integration:created");
  });

  it("isolates lists by authenticated tenant", async () => {
    const identifiers = [
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      "66666666-6666-4666-8666-666666666666",
      "77777777-7777-4777-8777-777777777777",
    ];
    const repository = new InMemoryIntegrationRepository({
      idGenerator: () => identifiers.shift() ?? "unexpected",
    });

    await repository.create({
      actorId: "55555555-5555-4555-8555-555555555555",
      configuration,
      tenantId: "11111111-1111-4111-8111-111111111111",
    });
    await repository.create({
      actorId: "88888888-8888-4888-8888-888888888888",
      configuration,
      tenantId: "99999999-9999-4999-8999-999999999999",
    });

    const tenantA = await repository.listForTenant(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(tenantA).toHaveLength(1);
    expect(tenantA[0]?.tenantId).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });
});

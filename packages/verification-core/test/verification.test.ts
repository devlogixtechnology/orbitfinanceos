import { describe, expect, it } from "vitest";

import {
  assertVerificationTransition,
  evaluateVerification,
  IllegalVerificationTransitionError,
} from "../src/index.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const movementId = "22222222-2222-4222-8222-222222222222";
const policy = {
  createdAt: "2026-09-29T00:00:00.000Z",
  finalityMode: "finalized_tag" as const,
  minimumIndependentProviders: 2,
  policyId: "33333333-3333-4333-8333-333333333333",
  requireExecution: true,
  requireInclusion: true,
  schemaVersion: "1" as const,
  tenantId,
  version: "bsc-v1",
};

function observation(
  provider: string,
  independenceGroup: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    agreementKey: "56:100:0xblock:0xtx:0",
    evidenceIds: [provider === "provider-a"
      ? "44444444-4444-4444-8444-444444444444"
      : "55555555-5555-4555-8555-555555555555"],
    execution: "succeeded" as const,
    finality: "final" as const,
    finalityTag: "finalized" as const,
    inclusion: "included" as const,
    independenceGroup,
    observedAt: "2026-09-29T00:01:00.000Z",
    provider,
    status: "available" as const,
    ...overrides,
  };
}

function evaluate(observations: readonly ReturnType<typeof observation>[]) {
  return evaluateVerification({
    decidedAt: "2026-09-29T00:02:00.000Z",
    decisionId: "66666666-6666-4666-8666-666666666666",
    movementId,
    observations,
    policy,
    tenantId,
  });
}

describe("independent verification", () => {
  it("does not let duplicate endpoints in one independence group satisfy quorum", () => {
    const result = evaluate([
      observation("provider-a", "operator-a"),
      observation("provider-a-replica", "operator-a"),
    ]);

    expect(result.verification).toBe("pending");
    expect(result.reasonCodes).toContain("verification:quorum_pending");
  });

  it("verifies only after every mandatory dimension passes across independent groups", () => {
    const result = evaluate([
      observation("provider-a", "operator-a"),
      observation("provider-b", "operator-b"),
    ]);

    expect(result).toMatchObject({
      agreement: "agreed",
      execution: "succeeded",
      finality: "final",
      inclusion: "included",
      verification: "verified",
    });
    expect(result.evidenceIds).toHaveLength(2);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("degrades when an independent provider is unavailable", () => {
    const result = evaluate([
      observation("provider-a", "operator-a"),
      observation("provider-b", "operator-b", {
        agreementKey: undefined,
        execution: "unknown",
        finality: "unknown",
        inclusion: "unknown",
        status: "unavailable",
      }),
    ]);

    expect(result.verification).toBe("degraded");
    expect(result.reasonCodes).toContain("verification:provider_unavailable");
  });

  it("records provider disagreement as a conflict", () => {
    const result = evaluate([
      observation("provider-a", "operator-a"),
      observation("provider-b", "operator-b", { agreementKey: "different-anchor" }),
    ]);

    expect(result.verification).toBe("conflicted");
    expect(result.agreement).toBe("conflicted");
    expect(result.reasonCodes).toContain("verification:provider_conflict");
  });

  it("rejects illegal shortcuts and terminal-state mutation", () => {
    expect(() => assertVerificationTransition("pending", "superseded")).toThrow(
      IllegalVerificationTransitionError,
    );
    expect(() => assertVerificationTransition("invalidated", "pending")).toThrow(
      IllegalVerificationTransitionError,
    );
    expect(() => assertVerificationTransition("verified", "invalidated")).not.toThrow();
  });
});

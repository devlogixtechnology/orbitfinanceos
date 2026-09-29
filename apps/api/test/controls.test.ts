import type { SessionAuthenticator } from "@orbitos/authz";
import type {
  OperationalException,
  PositionReconciliation,
  SessionContext,
  VerificationDecision,
} from "@orbitos/canonical-model";
import { InMemoryReconciliationQueryService } from "@orbitos/reconciliation-core";
import { InMemoryVerificationDecisionStore } from "@orbitos/verification-core";
import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server.js";

const tenantA = "10000000-0000-4000-8000-000000000001";
const tenantB = "20000000-0000-4000-8000-000000000002";
const actorId = "30000000-0000-4000-8000-000000000003";
const reconciliationId = "40000000-0000-4000-8000-000000000004";
const exceptionId = "50000000-0000-4000-8000-000000000005";
const movementId = "60000000-0000-4000-8000-000000000006";

function session(permissions: readonly string[]): SessionContext {
  return {
    actor: { actorId, subject: "operator-a" },
    authenticatedAt: "2026-09-29T00:00:00.000Z",
    expiresAt: "2026-09-30T00:00:00.000Z",
    permissions: [...permissions],
    roles: [permissions.includes("exceptions:write") ? "administrator" : "read_only_operator"],
    schemaVersion: "1",
    tenant: { displayName: "Tenant A", tenantId: tenantA },
  };
}

function authenticator(context: SessionContext): SessionAuthenticator {
  return { authenticate: () => Promise.resolve(context) };
}

const result: PositionReconciliation = {
  assetId: "bsc:56:USDT",
  completedAt: "2026-09-29T02:00:00.000Z",
  cutoff: "2026-09-29T01:00:00.000Z",
  differenceAtomic: "-1",
  exceptionCount: "1",
  excludedMovementIds: [],
  expectedClosingQuantityAtomic: "101",
  feeQuantityAtomic: "0",
  incomingQuantityAtomic: "1",
  observedClosingQuantityAtomic: "100",
  openingQuantityAtomic: "100",
  outgoingQuantityAtomic: "0",
  policyVersion: "bsc-v1",
  reconciliationId,
  schemaVersion: "1",
  state: "mismatched",
  tenantId: tenantA,
  verifiedMovementIds: [movementId],
  walletAddress: "0x1111111111111111111111111111111111111111",
};

const operationalException: OperationalException = {
  affectedResourceId: reconciliationId,
  affectedResourceType: "reconciliation",
  createdAt: "2026-09-29T02:00:00.000Z",
  exceptionId,
  reasonCode: "reconciliation:amount_difference",
  schemaVersion: "1",
  severity: "error",
  stableKey: "reconciliation:tenant-a:wallet:asset:cutoff:amount",
  state: "open",
  tenantId: tenantA,
  updatedAt: "2026-09-29T02:00:00.000Z",
};

const verificationDecision: VerificationDecision = {
  agreement: "agreed",
  decidedAt: "2026-09-29T01:30:00.000Z",
  decisionId: "70000000-0000-4000-8000-000000000007",
  evidenceIds: ["80000000-0000-4000-8000-000000000008"],
  execution: "succeeded",
  finality: "final",
  inclusion: "included",
  movementId,
  observations: [{
    agreementKey: "anchor",
    evidenceIds: ["80000000-0000-4000-8000-000000000008"],
    execution: "succeeded",
    finality: "final",
    inclusion: "included",
    independenceGroup: "operator-a",
    observedAt: "2026-09-29T01:20:00.000Z",
    provider: "provider-a",
    status: "available",
  }],
  policyId: "90000000-0000-4000-8000-000000000009",
  policyVersion: "bsc-v1",
  reasonCodes: ["verification:verified"],
  schemaVersion: "1",
  tenantId: tenantA,
  verification: "verified",
};

describe("verification, reconciliation, and exception APIs", () => {
  it("returns tenant-scoped control results and immutable verification history", async () => {
    const reconciliationService = new InMemoryReconciliationQueryService({
      exceptions: [operationalException, { ...operationalException, exceptionId: "51000000-0000-4000-8000-000000000005", tenantId: tenantB }],
      results: [result, { ...result, reconciliationId: "41000000-0000-4000-8000-000000000004", tenantId: tenantB }],
    });
    const verificationStore = new InMemoryVerificationDecisionStore();
    await verificationStore.append(verificationDecision);
    const server = buildServer({
      authenticator: authenticator(session(["exceptions:read", "reconciliation:read", "verification:read"])),
      reconciliationService,
      verificationStore,
    });

    const reconciliations = await server.inject({ headers: { authorization: "Bearer token" }, method: "GET", url: "/v1/reconciliations" });
    expect(reconciliations.statusCode).toBe(200);
    expect(reconciliations.json().data).toHaveLength(1);

    const exceptions = await server.inject({ headers: { authorization: "Bearer token" }, method: "GET", url: "/v1/exceptions" });
    expect(exceptions.statusCode).toBe(200);
    expect(exceptions.json().data).toEqual([expect.objectContaining({ exceptionId })]);

    const decisions = await server.inject({ headers: { authorization: "Bearer token" }, method: "GET", url: `/v1/movements/${movementId}/verification-decisions` });
    expect(decisions.statusCode).toBe(200);
    expect(decisions.json().data).toEqual([expect.objectContaining({ verification: "verified" })]);
    await server.close();
  });

  it("authorizes and audits workflow-only exception updates", async () => {
    const reconciliationService = new InMemoryReconciliationQueryService({
      clock: () => new Date("2026-09-29T03:00:00.000Z"),
      exceptions: [operationalException],
      idGenerator: () => "a0000000-0000-4000-8000-00000000000a",
    });
    const server = buildServer({
      authenticator: authenticator(session(["exceptions:read", "exceptions:write"])),
      reconciliationService,
    });

    const invalid = await server.inject({
      headers: { authorization: "Bearer token" },
      method: "PATCH",
      payload: { state: "resolved" },
      url: `/v1/exceptions/${exceptionId}`,
    });
    expect(invalid.statusCode).toBe(409);

    const updated = await server.inject({
      headers: { authorization: "Bearer token" },
      method: "PATCH",
      payload: { note: "Confirmed against the independent provider.", resolutionReasonCode: "exception:confirmed_difference", state: "resolved" },
      url: `/v1/exceptions/${exceptionId}`,
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      affectedResourceId: reconciliationId,
      resolutionReasonCode: "exception:confirmed_difference",
      state: "resolved",
    });

    const events = await server.inject({ headers: { authorization: "Bearer token" }, method: "GET", url: `/v1/exceptions/${exceptionId}/events` });
    expect(events.statusCode).toBe(200);
    expect(events.json().data).toEqual([expect.objectContaining({ actorId, note: "Confirmed against the independent provider." })]);
    await server.close();
  });

  it("runs a tenant-derived exact reconciliation through the authorized API", async () => {
    let receivedTenantId: string | undefined;
    const server = buildServer({
      authenticator: authenticator(session(["reconciliation:read", "reconciliation:write"])),
      reconciliationRunner: {
        run: (command) => {
          receivedTenantId = command.tenantId;
          return Promise.resolve(result);
        },
      },
    });
    const response = await server.inject({
      headers: { authorization: "Bearer token" },
      method: "POST",
      payload: {
        assetId: result.assetId,
        cutoff: result.cutoff,
        observedClosingQuantityAtomic: result.observedClosingQuantityAtomic,
        openingQuantityAtomic: result.openingQuantityAtomic,
        policyVersion: result.policyVersion,
        schemaVersion: "1",
        walletAddress: result.walletAddress,
      },
      url: "/v1/reconciliations",
    });
    expect(response.statusCode).toBe(201);
    expect(receivedTenantId).toBe(tenantA);
    expect(response.json()).toMatchObject({ reconciliationId, state: "mismatched" });
    await server.close();
  });

  it("denies workflow changes to read-only operators", async () => {
    const server = buildServer({
      authenticator: authenticator(session(["exceptions:read"])),
      reconciliationService: new InMemoryReconciliationQueryService({ exceptions: [operationalException] }),
    });
    const response = await server.inject({
      headers: { authorization: "Bearer token" },
      method: "PATCH",
      payload: { state: "investigating" },
      url: `/v1/exceptions/${exceptionId}`,
    });
    expect(response.statusCode).toBe(403);
    await server.close();
  });
});

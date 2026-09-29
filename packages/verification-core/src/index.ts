import {
  verificationDecisionSchema,
  verificationPolicySchema,
  verificationProviderObservationSchema,
  type VerificationDecision,
  type VerificationPolicy,
  type VerificationProviderObservation,
} from "@orbitos/canonical-model";

export interface EvaluateVerificationCommand {
  readonly decisionId: string;
  readonly decidedAt: string;
  readonly movementId: string;
  readonly observations: readonly VerificationProviderObservation[];
  readonly policy: VerificationPolicy;
  readonly previousDecision?: VerificationDecision;
  readonly tenantId: string;
}

export class IllegalVerificationTransitionError extends Error {
  override readonly name = "IllegalVerificationTransitionError";
}

export class VerificationUnavailableError extends Error {
  override readonly name = "VerificationUnavailableError";
}

export interface VerificationDecisionStore {
  append(decision: VerificationDecision): Promise<void>;
  listForMovement(tenantId: string, movementId: string): Promise<readonly VerificationDecision[]>;
}

export interface VerificationPolicyStore {
  getByVersion(tenantId: string, version: string): Promise<VerificationPolicy | null>;
}

export const unavailableVerificationPolicyStore: VerificationPolicyStore = {
  getByVersion: () => Promise.reject(new VerificationUnavailableError("Verification policy persistence is not configured")),
};

export class InMemoryVerificationPolicyStore implements VerificationPolicyStore {
  private readonly policies = new Map<string, VerificationPolicy>();

  constructor(policies: readonly VerificationPolicy[] = []) {
    for (const rawPolicy of policies) {
      const policy = verificationPolicySchema.parse(rawPolicy);
      this.policies.set(`${policy.tenantId}:${policy.version}`, policy);
    }
  }

  getByVersion(tenantId: string, version: string): Promise<VerificationPolicy | null> {
    return Promise.resolve(this.policies.get(`${tenantId}:${version}`) ?? null);
  }
}

export const unavailableVerificationDecisionStore: VerificationDecisionStore = {
  append: () => Promise.reject(new VerificationUnavailableError("Verification is not configured")),
  listForMovement: () => Promise.reject(new VerificationUnavailableError("Verification is not configured")),
};

export class InMemoryVerificationDecisionStore implements VerificationDecisionStore {
  private readonly decisions = new Map<string, VerificationDecision>();

  append(rawDecision: VerificationDecision): Promise<void> {
    const decision = verificationDecisionSchema.parse(rawDecision);
    const key = `${decision.tenantId}:${decision.decisionId}`;
    if (this.decisions.has(key)) {
      throw new TypeError("Verification decisions are immutable and may not be replaced");
    }
    this.decisions.set(key, structuredClone(decision));
    return Promise.resolve();
  }

  listForMovement(tenantId: string, movementId: string): Promise<readonly VerificationDecision[]> {
    return Promise.resolve(
      [...this.decisions.values()]
        .filter((decision) => decision.tenantId === tenantId && decision.movementId === movementId)
        .sort((left, right) => left.decidedAt.localeCompare(right.decidedAt))
        .map((decision) => structuredClone(decision)),
    );
  }
}

const legalTransitions: Readonly<Record<VerificationDecision["verification"], readonly VerificationDecision["verification"][]>> = {
  conflicted: ["pending", "superseded", "invalidated"],
  degraded: ["pending", "verified", "conflicted", "invalidated"],
  invalidated: [],
  pending: ["verified", "degraded", "conflicted", "invalidated"],
  superseded: [],
  verified: ["superseded", "invalidated"],
};

export function assertVerificationTransition(
  from: VerificationDecision["verification"],
  to: VerificationDecision["verification"],
): void {
  if (!legalTransitions[from].includes(to)) {
    throw new IllegalVerificationTransitionError(
      `Illegal verification transition from ${from} to ${to}`,
    );
  }
}

function groupObservations(
  observations: readonly VerificationProviderObservation[],
): ReadonlyMap<string, readonly VerificationProviderObservation[]> {
  const groups = new Map<string, VerificationProviderObservation[]>();
  for (const rawObservation of observations) {
    const observation = verificationProviderObservationSchema.parse(rawObservation);
    const group = groups.get(observation.independenceGroup) ?? [];
    group.push(observation);
    groups.set(observation.independenceGroup, group);
  }
  return groups;
}

function hasInternalGroupConflict(
  group: readonly VerificationProviderObservation[],
): boolean {
  const available = group.filter((observation) => observation.status === "available");
  const signatures = new Set(
    available.map((observation) =>
      JSON.stringify([
        observation.agreementKey,
        observation.execution,
        observation.finality,
        observation.inclusion,
      ]),
    ),
  );
  return signatures.size > 1;
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}

export function evaluateVerification(command: EvaluateVerificationCommand): VerificationDecision {
  const policy = verificationPolicySchema.parse(command.policy);
  if (policy.tenantId !== command.tenantId) {
    throw new TypeError("Verification policy must belong to the decision tenant");
  }

  const observations = command.observations.map((observation) =>
    verificationProviderObservationSchema.parse(observation),
  );
  if (observations.length === 0) {
    throw new TypeError("At least one provider observation is required");
  }

  const groups = groupObservations(observations);
  const groupConflict = [...groups.values()].some(hasInternalGroupConflict);
  const availableByGroup = [...groups.values()]
    .map((group) => group.find((observation) => observation.status === "available"))
    .filter((observation): observation is VerificationProviderObservation => observation !== undefined);
  const unavailable = observations.some((observation) => observation.status === "unavailable");
  const agreementKeys = unique(
    availableByGroup
      .map((observation) => observation.agreementKey)
      .filter((key): key is string => key !== undefined),
  );
  const explicitConflict =
    groupConflict ||
    agreementKeys.length > 1 ||
    availableByGroup.some(
      (observation) =>
        observation.inclusion === "not_included" ||
        observation.execution === "failed" ||
        observation.finality === "orphaned",
    );
  const quorumMet = availableByGroup.length >= policy.minimumIndependentProviders;
  const allIncluded = availableByGroup.every((observation) => observation.inclusion === "included");
  const allSucceeded = availableByGroup.every((observation) => observation.execution === "succeeded");
  const allFinal = availableByGroup.every((observation) => observation.finality === "final");
  const agreementMet = quorumMet && agreementKeys.length === 1;

  const inclusion = availableByGroup.some((observation) => observation.inclusion === "not_included")
    ? "not_included"
    : quorumMet && allIncluded
      ? "included"
      : availableByGroup.some((observation) => observation.inclusion === "pending")
        ? "pending"
        : "unknown";
  const execution = availableByGroup.some((observation) => observation.execution === "failed")
    ? "failed"
    : quorumMet && allSucceeded
      ? "succeeded"
      : "unknown";
  const finality = availableByGroup.some((observation) => observation.finality === "orphaned")
    ? "orphaned"
    : quorumMet && allFinal
      ? "final"
      : availableByGroup.some((observation) => observation.finality === "pending")
        ? "pending"
        : "unknown";
  const agreement = explicitConflict
    ? "conflicted"
    : agreementMet
      ? "agreed"
      : unavailable
        ? "degraded"
        : "pending";

  const mandatoryDimensionsPass =
    (!policy.requireInclusion || inclusion === "included") &&
    (!policy.requireExecution || execution === "succeeded") &&
    finality === "final" &&
    agreement === "agreed";
  const verification = explicitConflict
    ? "conflicted"
    : mandatoryDimensionsPass
      ? "verified"
      : unavailable
        ? "degraded"
        : "pending";

  const reasonCodes = new Set<string>();
  if (verification === "verified") reasonCodes.add("verification:verified");
  if (!quorumMet) reasonCodes.add("verification:quorum_pending");
  if (unavailable) reasonCodes.add("verification:provider_unavailable");
  if (groupConflict || agreementKeys.length > 1) reasonCodes.add("verification:provider_conflict");
  if (inclusion === "not_included") reasonCodes.add("verification:inclusion_failed");
  if (execution === "failed") reasonCodes.add("verification:execution_failed");
  if (finality === "orphaned") reasonCodes.add("verification:orphaned");
  if (finality !== "final" && finality !== "orphaned") reasonCodes.add("verification:finality_pending");

  if (command.previousDecision !== undefined) {
    if (
      command.previousDecision.tenantId !== command.tenantId ||
      command.previousDecision.movementId !== command.movementId
    ) {
      throw new TypeError("Previous decision must belong to the same tenant and movement");
    }
    assertVerificationTransition(command.previousDecision.verification, verification);
  }

  const decision = verificationDecisionSchema.parse({
    agreement,
    decidedAt: command.decidedAt,
    decisionId: command.decisionId,
    evidenceIds: unique(observations.flatMap((observation) => observation.evidenceIds)),
    execution,
    finality,
    inclusion,
    movementId: command.movementId,
    observations,
    policyId: policy.policyId,
    policyVersion: policy.version,
    reasonCodes: [...reasonCodes],
    schemaVersion: "1",
    supersedesDecisionId: command.previousDecision?.decisionId,
    tenantId: command.tenantId,
    verification,
  });

  Object.freeze(decision.evidenceIds);
  decision.observations.forEach((observation) => Object.freeze(observation));
  Object.freeze(decision.observations);
  Object.freeze(decision.reasonCodes);
  return Object.freeze(decision);
}

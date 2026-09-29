import {
  operationalExceptionSchema,
  positionReconciliationSchema,
  updateOperationalExceptionRequestSchema,
  type OperationalException,
  type CreatePositionReconciliationRequest,
  type PositionReconciliation as StoredPositionReconciliation,
  type UpdateOperationalExceptionRequest,
  type VerificationDecision,
} from "@orbitos/canonical-model";
import type { IngestionService } from "@orbitos/ingestion-core";
import type { VerificationDecisionStore } from "@orbitos/verification-core";

const exactIntegerPattern = /^-?(?:0|[1-9]\d*)$/u;
const unsignedIntegerPattern = /^(?:0|[1-9]\d*)$/u;

export type ReconciliationReason =
  | "amount_difference"
  | "verification_incomplete"
  | "reorganization";

export interface PositionChange {
  readonly assetId: string;
  readonly direction: "incoming" | "outgoing" | "fee";
  readonly effectiveAt: string;
  readonly movementId: string;
  readonly quantityAtomic: string;
  readonly verificationDecision: VerificationDecision;
  readonly walletAddress: string;
}

export interface ReconciliationException {
  readonly affectedMovementIds: readonly string[];
  readonly assetId: string;
  readonly reason: ReconciliationReason;
  readonly severity: "warning" | "error";
  readonly stableKey: string;
  readonly walletAddress: string;
}

export interface ReconcilePositionCommand {
  readonly assetId: string;
  readonly changes: readonly PositionChange[];
  readonly cutoff: string;
  readonly observedClosingQuantityAtomic?: string;
  readonly openingQuantityAtomic: string;
  readonly tenantId: string;
  readonly walletAddress: string;
}

export interface PositionReconciliation {
  readonly assetId: string;
  readonly cutoff: string;
  readonly differenceAtomic?: string;
  readonly exceptions: readonly ReconciliationException[];
  readonly excludedMovementIds: readonly string[];
  readonly expectedClosingQuantityAtomic: string;
  readonly feeQuantityAtomic: string;
  readonly incomingQuantityAtomic: string;
  readonly openingQuantityAtomic: string;
  readonly outgoingQuantityAtomic: string;
  readonly state: "matched" | "mismatched" | "not_observed";
  readonly tenantId: string;
  readonly verifiedMovementIds: readonly string[];
  readonly walletAddress: string;
}

function parseExact(value: string, field: string): bigint {
  if (!exactIntegerPattern.test(value)) {
    throw new TypeError(`${field} must be an exact base-10 integer string`);
  }
  return BigInt(value);
}

function parseUnsigned(value: string, field: string): bigint {
  if (!unsignedIntegerPattern.test(value)) {
    throw new TypeError(`${field} must be an exact unsigned base-10 integer string`);
  }
  return BigInt(value);
}

function stableKey(
  tenantId: string,
  walletAddress: string,
  assetId: string,
  cutoff: string,
  reason: ReconciliationReason,
): string {
  return ["reconciliation", tenantId, walletAddress.toLowerCase(), assetId.toLowerCase(), cutoff, reason]
    .map(encodeURIComponent)
    .join(":");
}

export function reconcilePosition(command: ReconcilePositionCommand): PositionReconciliation {
  const cutoff = new Date(command.cutoff);
  if (Number.isNaN(cutoff.getTime()) || !command.cutoff.endsWith("Z")) {
    throw new TypeError("cutoff must be a UTC instant");
  }
  const opening = parseExact(command.openingQuantityAtomic, "openingQuantityAtomic");
  let incoming = 0n;
  let outgoing = 0n;
  let fees = 0n;
  const verifiedMovementIds: string[] = [];
  const excludedMovementIds: string[] = [];

  for (const change of command.changes) {
    if (
      change.assetId !== command.assetId ||
      change.walletAddress.toLowerCase() !== command.walletAddress.toLowerCase() ||
      new Date(change.effectiveAt) > cutoff
    ) {
      continue;
    }
    if (change.verificationDecision.verification !== "verified") {
      excludedMovementIds.push(change.movementId);
      continue;
    }
    const quantity = parseUnsigned(change.quantityAtomic, "change.quantityAtomic");
    verifiedMovementIds.push(change.movementId);
    if (change.direction === "incoming") incoming += quantity;
    if (change.direction === "outgoing") outgoing += quantity;
    if (change.direction === "fee") fees += quantity;
  }

  const expected = opening + incoming - outgoing - fees;
  const observed = command.observedClosingQuantityAtomic === undefined
    ? undefined
    : parseExact(command.observedClosingQuantityAtomic, "observedClosingQuantityAtomic");
  const difference = observed === undefined ? undefined : observed - expected;
  const exceptions: ReconciliationException[] = [];
  if (difference !== undefined && difference !== 0n) {
    exceptions.push({
      affectedMovementIds: [...verifiedMovementIds],
      assetId: command.assetId,
      reason: "amount_difference",
      severity: "error",
      stableKey: stableKey(command.tenantId, command.walletAddress, command.assetId, command.cutoff, "amount_difference"),
      walletAddress: command.walletAddress,
    });
  }
  if (excludedMovementIds.length > 0) {
    exceptions.push({
      affectedMovementIds: [...excludedMovementIds],
      assetId: command.assetId,
      reason: "verification_incomplete",
      severity: "warning",
      stableKey: stableKey(command.tenantId, command.walletAddress, command.assetId, command.cutoff, "verification_incomplete"),
      walletAddress: command.walletAddress,
    });
  }

  return {
    assetId: command.assetId,
    cutoff: command.cutoff,
    ...(difference === undefined ? {} : { differenceAtomic: difference.toString() }),
    exceptions,
    excludedMovementIds,
    expectedClosingQuantityAtomic: expected.toString(),
    feeQuantityAtomic: fees.toString(),
    incomingQuantityAtomic: incoming.toString(),
    openingQuantityAtomic: opening.toString(),
    outgoingQuantityAtomic: outgoing.toString(),
    state: observed === undefined ? "not_observed" : difference === 0n ? "matched" : "mismatched",
    tenantId: command.tenantId,
    verifiedMovementIds: [...new Set(verifiedMovementIds)],
    walletAddress: command.walletAddress,
  };
}

export function deduplicateExceptions(
  existing: readonly ReconciliationException[],
  incoming: readonly ReconciliationException[],
): readonly ReconciliationException[] {
  const byStableKey = new Map(existing.map((item) => [item.stableKey, item]));
  for (const item of incoming) byStableKey.set(item.stableKey, item);
  return [...byStableKey.values()].sort((left, right) => left.stableKey.localeCompare(right.stableKey));
}

export interface CanonicalBlockAnchor {
  readonly blockHash: string;
  readonly blockNumber: string;
  readonly movementIds: readonly string[];
}

export interface ReorganizationResult {
  readonly changedBlockNumbers: readonly string[];
  readonly currentCanonicalMovementIds: readonly string[];
  readonly invalidatedMovementIds: readonly string[];
  readonly preservedOldBranch: readonly CanonicalBlockAnchor[];
}

export function resolveReorganization(
  previous: readonly CanonicalBlockAnchor[],
  current: readonly CanonicalBlockAnchor[],
): ReorganizationResult {
  const previousByNumber = new Map(previous.map((anchor) => [anchor.blockNumber, anchor]));
  const changedBlockNumbers: string[] = [];
  const invalidatedMovementIds = new Set<string>();
  const currentCanonicalMovementIds = new Set<string>();
  const preservedOldBranch: CanonicalBlockAnchor[] = [];

  for (const currentAnchor of current) {
    const oldAnchor = previousByNumber.get(currentAnchor.blockNumber);
    currentAnchor.movementIds.forEach((id) => currentCanonicalMovementIds.add(id));
    if (oldAnchor !== undefined && oldAnchor.blockHash !== currentAnchor.blockHash) {
      changedBlockNumbers.push(currentAnchor.blockNumber);
      preservedOldBranch.push(oldAnchor);
      oldAnchor.movementIds.forEach((id) => invalidatedMovementIds.add(id));
    }
  }

  return {
    changedBlockNumbers: changedBlockNumbers.sort((left, right) => (BigInt(left) < BigInt(right) ? -1 : 1)),
    currentCanonicalMovementIds: [...currentCanonicalMovementIds],
    invalidatedMovementIds: [...invalidatedMovementIds],
    preservedOldBranch,
  };
}

export interface ApplyReorganizationOptions {
  readonly clock?: () => Date;
  readonly idGenerator?: () => string;
}

export async function applyReorganizationInvalidations(
  tenantId: string,
  reorganization: ReorganizationResult,
  decisions: VerificationDecisionStore,
  options: ApplyReorganizationOptions = {},
): Promise<readonly VerificationDecision[]> {
  const clock = options.clock ?? (() => new Date());
  const idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
  const invalidations: VerificationDecision[] = [];
  for (const movementId of reorganization.invalidatedMovementIds) {
    const history = await decisions.listForMovement(tenantId, movementId);
    const previous = history.at(-1);
    if (
      previous === undefined ||
      previous.verification === "invalidated" ||
      previous.verification === "superseded"
    ) {
      continue;
    }
    const invalidation = {
      ...previous,
      agreement: "conflicted" as const,
      decidedAt: clock().toISOString(),
      decisionId: idGenerator(),
      finality: "orphaned" as const,
      inclusion: "not_included" as const,
      reasonCodes: [...new Set([...previous.reasonCodes, "verification:orphaned"])],
      supersedesDecisionId: previous.decisionId,
      verification: "invalidated" as const,
    };
    await decisions.append(invalidation);
    invalidations.push(invalidation);
  }
  return invalidations;
}

export interface ExceptionWorkflowEvent {
  readonly action: "exception:updated";
  readonly actorId: string;
  readonly after: OperationalException;
  readonly before: OperationalException;
  readonly eventId: string;
  readonly exceptionId: string;
  readonly note?: string;
  readonly occurredAt: string;
  readonly tenantId: string;
}

export interface UpdateExceptionCommand {
  readonly actorId: string;
  readonly changes: UpdateOperationalExceptionRequest;
  readonly exceptionId: string;
  readonly tenantId: string;
}

export interface ReconciliationQueryService {
  getException(tenantId: string, exceptionId: string): Promise<OperationalException | null>;
  getResult(tenantId: string, reconciliationId: string): Promise<StoredPositionReconciliation | null>;
  listExceptionEvents(tenantId: string, exceptionId: string): Promise<readonly ExceptionWorkflowEvent[]>;
  listExceptions(tenantId: string): Promise<readonly OperationalException[]>;
  listResults(tenantId: string): Promise<readonly StoredPositionReconciliation[]>;
  updateException(command: UpdateExceptionCommand): Promise<OperationalException | null>;
}

export interface ReconciliationWriter {
  record(
    result: StoredPositionReconciliation,
    exceptions: readonly OperationalException[],
  ): Promise<StoredPositionReconciliation>;
}

export interface RunReconciliationCommand {
  readonly request: CreatePositionReconciliationRequest;
  readonly tenantId: string;
}

export interface ReconciliationRunner {
  run(command: RunReconciliationCommand): Promise<StoredPositionReconciliation>;
}

export class ReconciliationUnavailableError extends Error {
  override readonly name = "ReconciliationUnavailableError";
}

export const unavailableReconciliationQueryService: ReconciliationQueryService = {
  getException: () => Promise.reject(new ReconciliationUnavailableError("Reconciliation is not configured")),
  getResult: () => Promise.reject(new ReconciliationUnavailableError("Reconciliation is not configured")),
  listExceptionEvents: () => Promise.reject(new ReconciliationUnavailableError("Reconciliation is not configured")),
  listExceptions: () => Promise.reject(new ReconciliationUnavailableError("Reconciliation is not configured")),
  listResults: () => Promise.reject(new ReconciliationUnavailableError("Reconciliation is not configured")),
  updateException: () => Promise.reject(new ReconciliationUnavailableError("Reconciliation is not configured")),
};

export const unavailableReconciliationRunner: ReconciliationRunner = {
  run: () => Promise.reject(new ReconciliationUnavailableError("Reconciliation runner is not configured")),
};

function movementAssetId(movement: Awaited<ReturnType<IngestionService["listMovements"]>>[number]): string {
  return `bsc:${movement.network.chainId}:${movement.asset.contractAddress?.toLowerCase() ?? "native"}`;
}

export interface ExactReconciliationRunnerOptions {
  readonly clock?: () => Date;
  readonly idGenerator?: () => string;
}

export class ExactReconciliationRunner implements ReconciliationRunner {
  private readonly clock: () => Date;
  private readonly idGenerator: () => string;

  constructor(
    private readonly ingestion: IngestionService,
    private readonly decisions: VerificationDecisionStore,
    private readonly writer: ReconciliationWriter,
    options: ExactReconciliationRunnerOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
  }

  async run(command: RunReconciliationCommand): Promise<StoredPositionReconciliation> {
    const movements = await this.ingestion.listMovements(command.tenantId);
    const wallet = command.request.walletAddress.toLowerCase();
    const changes: PositionChange[] = [];
    const missingDecisionMovementIds: string[] = [];
    for (const movement of movements) {
      if (movementAssetId(movement) !== command.request.assetId.toLowerCase()) continue;
      const history = await this.decisions.listForMovement(command.tenantId, movement.movementId);
      const latestDecision = history.at(-1);
      if (latestDecision === undefined) {
        if (
          movement.effectiveAt <= command.request.cutoff &&
          (movement.fromAddress.toLowerCase() === wallet || movement.toAddress?.toLowerCase() === wallet)
        ) {
          missingDecisionMovementIds.push(movement.movementId);
        }
        continue;
      }
      const common = {
        assetId: command.request.assetId,
        effectiveAt: movement.effectiveAt,
        movementId: movement.movementId,
        quantityAtomic: movement.quantityAtomic,
        verificationDecision: latestDecision,
        walletAddress: command.request.walletAddress,
      };
      if (movement.kind === "native_fee" && movement.fromAddress.toLowerCase() === wallet) {
        changes.push({ ...common, direction: "fee" });
      } else {
        if (movement.toAddress?.toLowerCase() === wallet) changes.push({ ...common, direction: "incoming" });
        if (movement.fromAddress.toLowerCase() === wallet) changes.push({ ...common, direction: "outgoing" });
      }
    }
    const calculated = reconcilePosition({
      assetId: command.request.assetId,
      changes,
      cutoff: command.request.cutoff,
      ...(command.request.observedClosingQuantityAtomic === undefined
        ? {}
        : { observedClosingQuantityAtomic: command.request.observedClosingQuantityAtomic }),
      openingQuantityAtomic: command.request.openingQuantityAtomic,
      tenantId: command.tenantId,
      walletAddress: command.request.walletAddress,
    });
    const completedAt = this.clock().toISOString();
    const reconciliationId = this.idGenerator();
    const { exceptions: originalExceptions, ...positionWithoutMissing } = calculated;
    const excludedMovementIds = [...new Set([
      ...positionWithoutMissing.excludedMovementIds,
      ...missingDecisionMovementIds,
    ])];
    const calculatedExceptions = [...originalExceptions];
    if (
      missingDecisionMovementIds.length > 0 &&
      !calculatedExceptions.some((item) => item.reason === "verification_incomplete")
    ) {
      calculatedExceptions.push({
        affectedMovementIds: [...missingDecisionMovementIds],
        assetId: command.request.assetId,
        reason: "verification_incomplete",
        severity: "warning",
        stableKey: stableKey(
          command.tenantId,
          command.request.walletAddress,
          command.request.assetId,
          command.request.cutoff,
          "verification_incomplete",
        ),
        walletAddress: command.request.walletAddress,
      });
    }
    const position = { ...positionWithoutMissing, excludedMovementIds };
    const exceptions = calculatedExceptions.map((item) => operationalExceptionSchema.parse({
      affectedResourceId: reconciliationId,
      affectedResourceType: "reconciliation",
      createdAt: completedAt,
      exceptionId: this.idGenerator(),
      reasonCode: `reconciliation:${item.reason}`,
      schemaVersion: "1",
      severity: item.severity,
      stableKey: item.stableKey,
      state: "open",
      tenantId: command.tenantId,
      updatedAt: completedAt,
    }));
    const result = positionReconciliationSchema.parse({
      ...position,
      completedAt,
      exceptionCount: exceptions.length.toString(),
      ...(command.request.observedClosingQuantityAtomic === undefined
        ? {}
        : { observedClosingQuantityAtomic: command.request.observedClosingQuantityAtomic }),
      policyVersion: command.request.policyVersion,
      reconciliationId,
      schemaVersion: "1",
    });
    return this.writer.record(result, exceptions);
  }
}

export interface InMemoryReconciliationQueryServiceOptions {
  readonly clock?: () => Date;
  readonly exceptions?: readonly OperationalException[];
  readonly idGenerator?: () => string;
  readonly results?: readonly StoredPositionReconciliation[];
}

export class InMemoryReconciliationQueryService implements ReconciliationQueryService, ReconciliationWriter {
  private readonly clock: () => Date;
  private readonly events: ExceptionWorkflowEvent[] = [];
  private readonly exceptions = new Map<string, OperationalException>();
  private readonly idGenerator: () => string;
  private readonly results = new Map<string, StoredPositionReconciliation>();

  constructor(options: InMemoryReconciliationQueryServiceOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
    for (const item of options.exceptions ?? []) {
      const parsed = operationalExceptionSchema.parse(item);
      this.exceptions.set(`${parsed.tenantId}:${parsed.exceptionId}`, parsed);
    }
    for (const item of options.results ?? []) {
      const parsed = positionReconciliationSchema.parse(item);
      this.results.set(`${parsed.tenantId}:${parsed.reconciliationId}`, parsed);
    }
  }

  getException(tenantId: string, exceptionId: string): Promise<OperationalException | null> {
    return Promise.resolve(this.exceptions.get(`${tenantId}:${exceptionId}`) ?? null);
  }

  getResult(tenantId: string, reconciliationId: string): Promise<StoredPositionReconciliation | null> {
    return Promise.resolve(this.results.get(`${tenantId}:${reconciliationId}`) ?? null);
  }

  listExceptionEvents(tenantId: string, exceptionId: string): Promise<readonly ExceptionWorkflowEvent[]> {
    return Promise.resolve(this.events.filter((event) => event.tenantId === tenantId && event.exceptionId === exceptionId));
  }

  listExceptions(tenantId: string): Promise<readonly OperationalException[]> {
    return Promise.resolve(
      [...this.exceptions.values()]
        .filter((item) => item.tenantId === tenantId)
        .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.exceptionId.localeCompare(right.exceptionId)),
    );
  }

  listResults(tenantId: string): Promise<readonly StoredPositionReconciliation[]> {
    return Promise.resolve(
      [...this.results.values()]
        .filter((item) => item.tenantId === tenantId)
        .sort((left, right) => right.cutoff.localeCompare(left.cutoff) || left.reconciliationId.localeCompare(right.reconciliationId)),
    );
  }

  updateException(command: UpdateExceptionCommand): Promise<OperationalException | null> {
    const changes = updateOperationalExceptionRequestSchema.parse(command.changes);
    const key = `${command.tenantId}:${command.exceptionId}`;
    const before = this.exceptions.get(key);
    if (before === undefined) return Promise.resolve(null);
    const nextState = changes.state ?? before.state;
    const resolutionReasonCode = changes.resolutionReasonCode ?? before.resolutionReasonCode;
    if (nextState === "resolved" && resolutionReasonCode === undefined) {
      throw new TypeError("Resolving an exception requires a resolution reason code");
    }
    const after = operationalExceptionSchema.parse({
      ...before,
      ...(changes.ownerActorId === undefined
        ? {}
        : { ownerActorId: changes.ownerActorId ?? undefined }),
      ...(nextState === "resolved"
        ? { resolutionReasonCode }
        : { resolutionReasonCode: undefined }),
      state: nextState,
      updatedAt: this.clock().toISOString(),
    });
    this.exceptions.set(key, after);
    this.events.push({
      action: "exception:updated",
      actorId: command.actorId,
      after,
      before,
      eventId: this.idGenerator(),
      exceptionId: command.exceptionId,
      ...(changes.note === undefined ? {} : { note: changes.note }),
      occurredAt: after.updatedAt,
      tenantId: command.tenantId,
    });
    return Promise.resolve(after);
  }

  record(
    result: StoredPositionReconciliation,
    exceptions: readonly OperationalException[],
  ): Promise<StoredPositionReconciliation> {
    const existing = [...this.results.values()].find((candidate) =>
      candidate.tenantId === result.tenantId &&
      candidate.walletAddress.toLowerCase() === result.walletAddress.toLowerCase() &&
      candidate.assetId.toLowerCase() === result.assetId.toLowerCase() &&
      candidate.cutoff === result.cutoff &&
      candidate.policyVersion === result.policyVersion,
    );
    if (existing !== undefined) return Promise.resolve(existing);
    this.results.set(`${result.tenantId}:${result.reconciliationId}`, result);
    for (const item of exceptions) {
      const duplicate = [...this.exceptions.values()].some((candidate) =>
        candidate.tenantId === item.tenantId && candidate.stableKey === item.stableKey,
      );
      if (!duplicate) this.exceptions.set(`${item.tenantId}:${item.exceptionId}`, item);
    }
    return Promise.resolve(result);
  }
}

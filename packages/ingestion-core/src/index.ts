import {
  canonicalChainMovementSchema,
  ingestionQuarantineSchema,
  ingestionRunSchema,
  type CanonicalChainMovement,
  type IngestionQuarantine,
  type IngestionRun,
} from "@orbitos/canonical-model";

export interface CreateRunCommand {
  readonly endBlock: string;
  readonly integrationId: string;
  readonly startBlock: string;
  readonly tenantId: string;
}

export interface QuarantineCommand {
  readonly blockNumber: string;
  readonly evidenceIds: readonly string[];
  readonly integrationId: string;
  readonly reasonCode: string;
  readonly runId: string;
  readonly tenantId: string;
}

export interface CompleteBlockCommand {
  readonly blockNumber: string;
  readonly movements: readonly CanonicalChainMovement[];
  readonly runId: string;
  readonly tenantId: string;
}

export interface IngestionRepository {
  acquireLease(
    tenantId: string,
    runId: string,
    ownerId: string,
    ttlMilliseconds: number,
  ): Promise<{ readonly expiresAt: string; readonly token: string } | null>;
  completeBlock(command: CompleteBlockCommand): Promise<IngestionRun>;
  createRun(command: CreateRunCommand): Promise<IngestionRun>;
  getRun(tenantId: string, runId: string): Promise<IngestionRun | null>;
  listMovements(tenantId: string, integrationId?: string): Promise<readonly CanonicalChainMovement[]>;
  listRuns(tenantId: string, integrationId?: string): Promise<readonly IngestionRun[]>;
  quarantine(command: QuarantineCommand): Promise<IngestionQuarantine>;
  renewLease(
    tenantId: string,
    runId: string,
    token: string,
    ttlMilliseconds: number,
  ): Promise<{ readonly expiresAt: string } | null>;
  releaseLease(tenantId: string, runId: string, token: string): Promise<boolean>;
  setRunState(
    tenantId: string,
    runId: string,
    state: IngestionRun["state"],
    failureCode?: string,
  ): Promise<IngestionRun | null>;
}

export interface IngestionService {
  listMovements(tenantId: string, integrationId?: string): Promise<readonly CanonicalChainMovement[]>;
  listRuns(tenantId: string, integrationId?: string): Promise<readonly IngestionRun[]>;
  pause(tenantId: string, runId: string): Promise<IngestionRun | null>;
  resume(tenantId: string, runId: string): Promise<IngestionRun | null>;
  start(command: CreateRunCommand): Promise<IngestionRun>;
  stop(tenantId: string, runId: string): Promise<IngestionRun | null>;
}

export class IngestionUnavailableError extends Error {
  override readonly name = "IngestionUnavailableError";
}

export const unavailableIngestionService: IngestionService = {
  listMovements: () => Promise.reject(new IngestionUnavailableError("Ingestion is not configured")),
  listRuns: () => Promise.reject(new IngestionUnavailableError("Ingestion is not configured")),
  pause: () => Promise.reject(new IngestionUnavailableError("Ingestion is not configured")),
  resume: () => Promise.reject(new IngestionUnavailableError("Ingestion is not configured")),
  start: () => Promise.reject(new IngestionUnavailableError("Ingestion is not configured")),
  stop: () => Promise.reject(new IngestionUnavailableError("Ingestion is not configured")),
};

export interface InMemoryIngestionRepositoryOptions {
  readonly clock?: () => Date;
  readonly idGenerator?: () => string;
}

export class InMemoryIngestionRepository implements IngestionRepository {
  private readonly clock: () => Date;
  private readonly idGenerator: () => string;
  private readonly movements = new Map<string, CanonicalChainMovement>();
  private readonly quarantines = new Map<string, IngestionQuarantine>();
  private readonly runs = new Map<string, IngestionRun>();
  private readonly leases = new Map<string, { expiresAt: Date; token: string }>();

  constructor(options: InMemoryIngestionRepositoryOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
  }

  createRun(command: CreateRunCommand): Promise<IngestionRun> {
    if (BigInt(command.endBlock) < BigInt(command.startBlock)) {
      throw new RangeError("endBlock must not be before startBlock");
    }
    const run = ingestionRunSchema.parse({
      endBlock: command.endBlock,
      integrationId: command.integrationId,
      movementCount: "0",
      quarantineCount: "0",
      runId: this.idGenerator(),
      schemaVersion: "1",
      startedAt: this.clock().toISOString(),
      startBlock: command.startBlock,
      state: "queued",
      tenantId: command.tenantId,
    });
    this.runs.set(run.runId, run);
    return Promise.resolve(run);
  }

  acquireLease(tenantId: string, runId: string, _ownerId: string, ttlMilliseconds: number): Promise<{ readonly expiresAt: string; readonly token: string } | null> {
    this.requireRun(tenantId, runId);
    const existing = this.leases.get(runId);
    const now = this.clock();
    if (existing !== undefined && existing.expiresAt > now) return Promise.resolve(null);
    const token = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + ttlMilliseconds);
    this.leases.set(runId, { expiresAt, token });
    return Promise.resolve({ expiresAt: expiresAt.toISOString(), token });
  }

  completeBlock(command: CompleteBlockCommand): Promise<IngestionRun> {
    const current = this.requireRun(command.tenantId, command.runId);
    for (const movementInput of command.movements) {
      const movement = canonicalChainMovementSchema.parse(movementInput);
      const identity = [movement.tenantId, movement.integrationId, movement.network.chainId, movement.transactionHash.toLowerCase(), movement.logIndex ?? "fee"].join(":");
      if (!this.movements.has(identity)) {
        this.movements.set(identity, movement);
      }
    }
    const tenantMovements = [...this.movements.values()].filter(
      (item) => item.tenantId === current.tenantId && item.integrationId === current.integrationId,
    );
    const completed = BigInt(command.blockNumber) >= BigInt(current.endBlock);
    const updated = ingestionRunSchema.parse({
      ...current,
      checkpointBlock: command.blockNumber,
      ...(completed ? { completedAt: this.clock().toISOString() } : {}),
      movementCount: tenantMovements.length.toString(),
      state: completed ? "completed" : "running",
    });
    this.runs.set(updated.runId, updated);
    return Promise.resolve(updated);
  }

  getRun(tenantId: string, runId: string): Promise<IngestionRun | null> {
    const run = this.runs.get(runId);
    return Promise.resolve(run?.tenantId === tenantId ? run : null);
  }

  listMovements(tenantId: string, integrationId?: string): Promise<readonly CanonicalChainMovement[]> {
    return Promise.resolve([...this.movements.values()].filter(
      (item) => item.tenantId === tenantId && (integrationId === undefined || item.integrationId === integrationId),
    ));
  }

  listRuns(tenantId: string, integrationId?: string): Promise<readonly IngestionRun[]> {
    return Promise.resolve([...this.runs.values()].filter(
      (item) => item.tenantId === tenantId && (integrationId === undefined || item.integrationId === integrationId),
    ));
  }

  quarantine(command: QuarantineCommand): Promise<IngestionQuarantine> {
    const current = this.requireRun(command.tenantId, command.runId);
    const item = ingestionQuarantineSchema.parse({
      ...command,
      createdAt: this.clock().toISOString(),
      quarantineId: this.idGenerator(),
      schemaVersion: "1",
    });
    this.quarantines.set(item.quarantineId, item);
    const updated = ingestionRunSchema.parse({
      ...current,
      failureCode: command.reasonCode,
      quarantineCount: (BigInt(current.quarantineCount) + 1n).toString(),
      state: "failed",
    });
    this.runs.set(updated.runId, updated);
    return Promise.resolve(item);
  }

  releaseLease(tenantId: string, runId: string, token: string): Promise<boolean> {
    this.requireRun(tenantId, runId);
    const lease = this.leases.get(runId);
    if (lease?.token !== token) return Promise.resolve(false);
    this.leases.delete(runId);
    return Promise.resolve(true);
  }

  renewLease(
    tenantId: string,
    runId: string,
    token: string,
    ttlMilliseconds: number,
  ): Promise<{ readonly expiresAt: string } | null> {
    this.requireRun(tenantId, runId);
    const lease = this.leases.get(runId);
    const now = this.clock();
    if (lease?.token !== token || lease.expiresAt <= now) return Promise.resolve(null);
    const expiresAt = new Date(now.getTime() + ttlMilliseconds);
    this.leases.set(runId, { expiresAt, token });
    return Promise.resolve({ expiresAt: expiresAt.toISOString() });
  }

  setRunState(tenantId: string, runId: string, state: IngestionRun["state"], failureCode?: string): Promise<IngestionRun | null> {
    const current = this.runs.get(runId);
    if (current === undefined || current.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    const updated = ingestionRunSchema.parse({
      ...current,
      ...(failureCode === undefined ? {} : { failureCode }),
      state,
    });
    this.runs.set(runId, updated);
    return Promise.resolve(updated);
  }

  private requireRun(tenantId: string, runId: string): IngestionRun {
    const run = this.runs.get(runId);
    if (run === undefined || run.tenantId !== tenantId) {
      throw new Error("Ingestion run was not found");
    }
    return run;
  }
}

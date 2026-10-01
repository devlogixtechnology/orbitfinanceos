import {
  auditEventSchema,
  createIntegrationRequestSchema,
  integrationSchema,
  updateIntegrationRequestSchema,
  type AuditEvent,
  type CreateIntegrationRequest,
  type Integration,
  type UpdateIntegrationRequest,
} from "@orbitos/canonical-model";

interface PrivateIntegrationRecord {
  readonly auditEvent: AuditEvent;
  readonly configuration: CreateIntegrationRequest;
  readonly integration: Integration;
}

export interface CreateIntegrationCommand {
  readonly actorId: string;
  readonly configuration: CreateIntegrationRequest;
  readonly tenantId: string;
}

export interface CreateIntegrationResult {
  readonly auditEvent: AuditEvent;
  readonly integration: Integration;
}

export interface IntegrationRepository {
  create(command: CreateIntegrationCommand): Promise<CreateIntegrationResult>;
  getForTenant(tenantId: string, integrationId: string): Promise<Integration | null>;
  listForTenant(tenantId: string, customerId?: string): Promise<readonly Integration[]>;
  update(command: UpdateIntegrationCommand): Promise<Integration | null>;
}

export interface UpdateIntegrationCommand {
  readonly actorId: string;
  readonly changes: UpdateIntegrationRequest;
  readonly integrationId: string;
  readonly tenantId: string;
}

export class IntegrationRepositoryUnavailableError extends Error {
  override readonly name = "IntegrationRepositoryUnavailableError";
}

export const unavailableIntegrationRepository: IntegrationRepository = {
  create: () =>
    Promise.reject(
      new IntegrationRepositoryUnavailableError(
        "No durable integration repository is configured",
      ),
    ),
  getForTenant: () =>
    Promise.reject(
      new IntegrationRepositoryUnavailableError(
        "No durable integration repository is configured",
      ),
    ),
  listForTenant: () =>
    Promise.reject(
      new IntegrationRepositoryUnavailableError(
        "No durable integration repository is configured",
      ),
    ),
  update: () =>
    Promise.reject(
      new IntegrationRepositoryUnavailableError(
        "No durable integration repository is configured",
      ),
    ),
};

export interface InMemoryIntegrationRepositoryOptions {
  readonly clock?: () => Date;
  readonly idGenerator?: () => string;
}

export class InMemoryIntegrationRepository implements IntegrationRepository {
  private readonly clock: () => Date;
  private readonly idGenerator: () => string;
  private readonly records = new Map<string, PrivateIntegrationRecord>();

  constructor(options: InMemoryIntegrationRepositoryOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
  }

  create(command: CreateIntegrationCommand): Promise<CreateIntegrationResult> {
    const configuration = createIntegrationRequestSchema.parse(
      command.configuration,
    );
    const integrationId = this.idGenerator();
    const createdAt = this.clock().toISOString();
    const integration = integrationSchema.parse({
      createdAt,
      ...(configuration.customerId ? { customerId: configuration.customerId } : {}),
      enabled: true,
      finalityPolicyVersion: configuration.finalityPolicyVersion,
      integrationId,
      network: configuration.network,
      provider: configuration.provider,
      providerGroups: configuration.providerGroups.map((group) => ({
        groupId: group.groupId,
        hasSecretReference: group.secretReference !== undefined,
        independenceGroup: group.independenceGroup,
      })),
      schemaVersion: "1",
      startingBlock: configuration.startingBlock,
      tenantId: command.tenantId,
      tokenContracts: configuration.tokenContracts,
      walletAddresses: configuration.walletAddresses,
    });
    const auditEvent = auditEventSchema.parse({
      action: "integration:created",
      actorId: command.actorId,
      auditEventId: this.idGenerator(),
      occurredAt: createdAt,
      resourceId: integrationId,
      resourceType: "integration",
      schemaVersion: "1",
      tenantId: command.tenantId,
    });

    this.records.set(integrationId, {
      auditEvent,
      configuration: structuredClone(configuration),
      integration,
    });

    return Promise.resolve({ auditEvent, integration });
  }

  listForTenant(tenantId: string, customerId?: string): Promise<readonly Integration[]> {
    return Promise.resolve(
      [...this.records.values()]
        .map((record) => record.integration)
        .filter(
          (integration) =>
            integration.tenantId === tenantId &&
            (customerId === undefined || integration.customerId === customerId),
        ),
    );
  }

  getForTenant(tenantId: string, integrationId: string): Promise<Integration | null> {
    const integration = this.records.get(integrationId)?.integration;
    return Promise.resolve(
      integration?.tenantId === tenantId ? integration : null,
    );
  }

  update(command: UpdateIntegrationCommand): Promise<Integration | null> {
    const record = this.records.get(command.integrationId);
    if (record === undefined || record.integration.tenantId !== command.tenantId) {
      return Promise.resolve(null);
    }
    const changes = updateIntegrationRequestSchema.parse(command.changes);
    const providerGroups = changes.providerGroups?.map((group) => ({
      groupId: group.groupId,
      hasSecretReference: group.secretReference !== undefined,
      independenceGroup: group.independenceGroup,
    }));
    const integration = integrationSchema.parse({
      ...record.integration,
      ...(changes.enabled === undefined ? {} : { enabled: changes.enabled }),
      ...(changes.finalityPolicyVersion === undefined
        ? {}
        : { finalityPolicyVersion: changes.finalityPolicyVersion }),
      ...(providerGroups === undefined ? {} : { providerGroups }),
      ...(changes.startingBlock === undefined
        ? {}
        : { startingBlock: changes.startingBlock }),
      ...(changes.tokenContracts === undefined
        ? {}
        : { tokenContracts: changes.tokenContracts }),
      ...(changes.walletAddresses === undefined
        ? {}
        : { walletAddresses: changes.walletAddresses }),
    });
    const occurredAt = this.clock().toISOString();
    const auditEvent = auditEventSchema.parse({
      action: "integration:updated",
      actorId: command.actorId,
      auditEventId: this.idGenerator(),
      occurredAt,
      resourceId: integration.integrationId,
      resourceType: "integration",
      schemaVersion: "1",
      tenantId: command.tenantId,
    });
    this.records.set(command.integrationId, {
      auditEvent,
      configuration: {
        ...record.configuration,
        ...(changes.finalityPolicyVersion === undefined
          ? {}
          : { finalityPolicyVersion: changes.finalityPolicyVersion }),
        ...(changes.providerGroups === undefined
          ? {}
          : { providerGroups: changes.providerGroups }),
        ...(changes.startingBlock === undefined
          ? {}
          : { startingBlock: changes.startingBlock }),
        ...(changes.tokenContracts === undefined
          ? {}
          : { tokenContracts: changes.tokenContracts }),
        ...(changes.walletAddresses === undefined
          ? {}
          : { walletAddresses: changes.walletAddresses }),
      },
      integration,
    });
    return Promise.resolve(integration);
  }
}

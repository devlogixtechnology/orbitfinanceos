import {
  Kysely,
  PostgresDialect,
  sql,
  type Transaction,
} from "kysely";
import {
  auditEventSchema,
  createIntegrationRequestSchema,
  canonicalChainMovementSchema,
  ingestionQuarantineSchema,
  ingestionRunSchema,
  integrationSchema,
  operationalExceptionSchema,
  positionReconciliationSchema,
  updateOperationalExceptionRequestSchema,
  updateIntegrationRequestSchema,
  verificationDecisionSchema,
  verificationPolicySchema,
  type CanonicalChainMovement,
  type IngestionRun,
  type Integration,
  type OperationalException,
  type PositionReconciliation,
  sessionContextSchema,
  type SessionContext,
  type VerificationDecision,
  type VerificationPolicy,
} from "@orbitos/canonical-model";
import {
  permissionsForRoles,
  type CreateStoredSessionCommand,
  type CustomAuthRepository,
  type StoredCredential,
} from "@orbitos/authz";
import type {
  CreateIntegrationCommand,
  CreateIntegrationResult,
  IntegrationRepository,
  UpdateIntegrationCommand,
} from "@orbitos/integration-core";
import type {
  CompleteBlockCommand,
  CreateRunCommand,
  IngestionRepository,
  QuarantineCommand,
} from "@orbitos/ingestion-core";
import type { DurableEvidenceObject } from "@orbitos/evidence-core";
import type {
  ExceptionWorkflowEvent,
  ReconciliationQueryService,
  ReconciliationWriter,
  UpdateExceptionCommand,
} from "@orbitos/reconciliation-core";
import type { VerificationDecisionStore, VerificationPolicyStore } from "@orbitos/verification-core";
import { Pool, type PoolConfig } from "pg";
import { createHash, randomBytes } from "node:crypto";

export * from "./control-plane.js";
export * from "./data-connections.js";

export interface DatabaseSchema {
  readonly [tableName: string]: Record<string, unknown>;
}

export function createDatabase(
  connectionString: string,
  poolConfig: Omit<PoolConfig, "connectionString"> = {},
): Kysely<DatabaseSchema> {
  return new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({
      pool: new Pool({ ...poolConfig, connectionString }),
    }),
  });
}

export async function checkDatabaseReadiness(
  database: Kysely<DatabaseSchema>,
): Promise<void> {
  await sql`select 1`.execute(database);
}

export async function withTenantTransaction<T>(
  database: Kysely<DatabaseSchema>,
  tenantId: string,
  operation: (transaction: Transaction<DatabaseSchema>) => Promise<T>,
): Promise<T> {
  return database.transaction().execute(async (transaction) => {
    await sql`select set_config('app.tenant_id', ${tenantId}, true)`.execute(
      transaction,
    );
    return operation(transaction);
  });
}

interface IntegrationRow {
  readonly chain_id: "56" | "97";
  readonly created_at: Date;
  readonly customer_id?: string | null;
  readonly enabled: boolean;
  readonly finality_policy_version: string;
  readonly id: string;
  readonly network_family: "evm";
  readonly provider: "bsc-json-rpc";
  readonly provider_groups: readonly {
    readonly endpointReference: string;
    readonly groupId: string;
    readonly independenceGroup: string;
    readonly secretReference?: string | undefined;
  }[];
  readonly starting_block: string;
  readonly tenant_id: string;
  readonly token_contracts: readonly string[];
  readonly wallet_addresses: readonly string[];
}

function toIntegration(row: IntegrationRow): Integration {
  return integrationSchema.parse({
    createdAt: row.created_at.toISOString(),
    ...(typeof row.customer_id === "string" ? { customerId: row.customer_id } : {}),
    enabled: row.enabled,
    finalityPolicyVersion: row.finality_policy_version,
    integrationId: row.id,
    network: {
      chainId: row.chain_id,
      family: row.network_family,
    },
    provider: row.provider,
    providerGroups: row.provider_groups.map((group) => ({
      groupId: group.groupId,
      hasSecretReference: group.secretReference !== undefined,
      independenceGroup: group.independenceGroup,
    })),
    schemaVersion: "1",
    startingBlock: row.starting_block,
    tenantId: row.tenant_id,
    tokenContracts: [...row.token_contracts],
    walletAddresses: [...row.wallet_addresses],
  });
}

export interface PostgresIntegrationRepositoryOptions {
  readonly clock?: () => Date;
  readonly idGenerator?: () => string;
}

export class PostgresIntegrationRepository implements IntegrationRepository {
  private readonly clock: () => Date;
  private readonly idGenerator: () => string;

  constructor(
    private readonly database: Kysely<DatabaseSchema>,
    options: PostgresIntegrationRepositoryOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
  }

  async create(
    command: CreateIntegrationCommand,
  ): Promise<CreateIntegrationResult> {
    const configuration = createIntegrationRequestSchema.parse(
      command.configuration,
    );
    const integrationId = this.idGenerator();
    const auditEventId = this.idGenerator();
    const createdAt = this.clock();

    return withTenantTransaction(
      this.database,
      command.tenantId,
      async (transaction) => {
        await sql`
          insert into orbit.integrations (
            tenant_id,
            id,
            customer_id,
            provider,
            network_family,
            chain_id,
            starting_block,
            finality_policy_version,
            provider_groups,
            wallet_addresses,
            token_contracts,
            enabled,
            created_at
          ) values (
            ${command.tenantId}::uuid,
            ${integrationId}::uuid,
            ${configuration.customerId ?? null}::uuid,
            ${configuration.provider},
            ${configuration.network.family},
            ${configuration.network.chainId},
            ${configuration.startingBlock},
            ${configuration.finalityPolicyVersion},
            ${JSON.stringify(configuration.providerGroups)}::jsonb,
            ${configuration.walletAddresses}::text[],
            ${configuration.tokenContracts}::text[],
            true,
            ${createdAt}
          )
        `.execute(transaction);

        await sql`
          insert into orbit.audit_events (
            tenant_id,
            id,
            actor_id,
            action,
            resource_type,
            resource_id,
            correlation_id,
            after_state,
            occurred_at
          ) values (
            ${command.tenantId}::uuid,
            ${auditEventId}::uuid,
            ${command.actorId}::uuid,
            'integration:created',
            'integration',
            ${integrationId}::uuid,
            ${auditEventId},
            ${JSON.stringify({ integrationId })}::jsonb,
            ${createdAt}
          )
        `.execute(transaction);

        const integration = toIntegration({
          chain_id: configuration.network.chainId,
          created_at: createdAt,
          enabled: true,
          finality_policy_version: configuration.finalityPolicyVersion,
          id: integrationId,
          network_family: configuration.network.family,
          provider: configuration.provider,
          provider_groups: configuration.providerGroups,
          starting_block: configuration.startingBlock,
          tenant_id: command.tenantId,
          token_contracts: configuration.tokenContracts,
          wallet_addresses: configuration.walletAddresses,
        });
        const auditEvent = auditEventSchema.parse({
          action: "integration:created",
          actorId: command.actorId,
          auditEventId,
          occurredAt: createdAt.toISOString(),
          resourceId: integrationId,
          resourceType: "integration",
          schemaVersion: "1",
          tenantId: command.tenantId,
        });

        return { auditEvent, integration };
      },
    );
  }

  async listForTenant(tenantId: string, customerId?: string): Promise<readonly Integration[]> {
    return withTenantTransaction(this.database, tenantId, async (transaction) => {
      const result = customerId === undefined
        ? await sql<IntegrationRow>`
            select
              tenant_id,
              id,
              customer_id,
              provider,
              network_family,
              chain_id,
              starting_block,
              finality_policy_version,
              provider_groups,
              wallet_addresses,
              token_contracts,
              enabled,
              created_at
            from orbit.integrations
            order by created_at asc, id asc
          `.execute(transaction)
        : await sql<IntegrationRow>`
            select
              tenant_id,
              id,
              customer_id,
              provider,
              network_family,
              chain_id,
              starting_block,
              finality_policy_version,
              provider_groups,
              wallet_addresses,
              token_contracts,
              enabled,
              created_at
            from orbit.integrations
            where customer_id = ${customerId}::uuid
            order by created_at asc, id asc
          `.execute(transaction);

      return result.rows.map(toIntegration);
    });
  }

  async getForTenant(
    tenantId: string,
    integrationId: string,
  ): Promise<Integration | null> {
    return withTenantTransaction(this.database, tenantId, async (transaction) => {
      const result = await sql<IntegrationRow>`
        select
          tenant_id,
          id,
          customer_id,
          provider,
          network_family,
          chain_id,
          starting_block,
          finality_policy_version,
          provider_groups,
          wallet_addresses,
          token_contracts,
          enabled,
          created_at
        from orbit.integrations
        where id = ${integrationId}::uuid
      `.execute(transaction);
      const row = result.rows[0];
      return row === undefined ? null : toIntegration(row);
    });
  }

  async update(command: UpdateIntegrationCommand): Promise<Integration | null> {
    const changes = updateIntegrationRequestSchema.parse(command.changes);
    return withTenantTransaction(this.database, command.tenantId, async (transaction) => {
      const updated = await sql<IntegrationRow>`
        update orbit.integrations
        set
          enabled = coalesce(${changes.enabled ?? null}::boolean, enabled),
          finality_policy_version = coalesce(${changes.finalityPolicyVersion ?? null}::text, finality_policy_version),
          provider_groups = coalesce(${changes.providerGroups === undefined ? null : JSON.stringify(changes.providerGroups)}::jsonb, provider_groups),
          starting_block = coalesce(${changes.startingBlock ?? null}::text, starting_block),
          token_contracts = coalesce(${changes.tokenContracts ?? null}::text[], token_contracts),
          wallet_addresses = coalesce(${changes.walletAddresses ?? null}::text[], wallet_addresses)
        where id = ${command.integrationId}::uuid
        returning
          tenant_id,
          id,
          provider,
          network_family,
          chain_id,
          starting_block,
          finality_policy_version,
          provider_groups,
          wallet_addresses,
          token_contracts,
          enabled,
          created_at
      `.execute(transaction);
      const row = updated.rows[0];
      if (row === undefined) return null;

      const occurredAt = this.clock();
      await sql`
        insert into orbit.audit_events (
          tenant_id, id, actor_id, action, resource_type, resource_id,
          correlation_id, after_state, occurred_at
        ) values (
          ${command.tenantId}::uuid,
          ${this.idGenerator()}::uuid,
          ${command.actorId}::uuid,
          'integration:updated',
          'integration',
          ${command.integrationId}::uuid,
          ${command.integrationId},
          ${JSON.stringify(changes)}::jsonb,
          ${occurredAt}
        )
      `.execute(transaction);
      return toIntegration(row);
    });
  }
}

interface CredentialRow {
  readonly actor_id: string;
  readonly customer_id?: string | null;
  readonly email: string;
  readonly explicit_permissions: readonly string[];
  readonly external_subject: string;
  readonly failed_authentication_count: number;
  readonly locked_until: Date | null;
  readonly password_hash: string;
  readonly roles: readonly string[];
  readonly tenant_display_name: string;
  readonly tenant_id: string;
}

function toStoredCredential(row: CredentialRow): StoredCredential {
  return {
    actorId: row.actor_id,
    ...(typeof row.customer_id === "string" ? { customerId: row.customer_id } : {}),
    email: row.email,
    explicitPermissions: row.explicit_permissions,
    failedAuthenticationCount: row.failed_authentication_count,
    lockedUntil: row.locked_until,
    passwordHash: row.password_hash,
    roles: row.roles,
    subject: row.external_subject,
    tenantDisplayName: row.tenant_display_name,
    tenantId: row.tenant_id,
  };
}

export class PostgresCustomAuthRepository implements CustomAuthRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async createSession(command: CreateStoredSessionCommand): Promise<void> {
    await sql`
      insert into orbit.auth_sessions (
        tenant_id,
        id,
        actor_id,
        token_sha256,
        created_at,
        expires_at,
        last_seen_at
      ) values (
        ${command.tenantId}::uuid,
        ${command.sessionId}::uuid,
        ${command.actorId}::uuid,
        ${command.tokenDigest},
        ${command.createdAt},
        ${command.expiresAt},
        ${command.createdAt}
      )
    `.execute(this.database);
  }

  async findCredentialByEmail(email: string): Promise<StoredCredential | null> {
    const lookup = await sql<{
      actor_id: string;
      email: string;
      failed_authentication_count: number;
      locked_until: Date | null;
      password_hash: string;
      tenant_id: string;
    }>`
      select
        tenant_id,
        actor_id,
        email,
        password_hash,
        failed_authentication_count,
        locked_until
      from orbit.auth_credentials
      where email = ${email}
        and enabled = true
    `.execute(this.database);
    const credential = lookup.rows[0];
    if (credential === undefined) {
      return null;
    }

    return withTenantTransaction(
      this.database,
      credential.tenant_id,
      async (transaction) => {
        const identity = await sql<{
          customer_id: string | null;
          external_subject: string;
          explicit_permissions: readonly string[];
          roles: readonly string[];
          tenant_display_name: string;
        }>`
          select
            actors.customer_id,
            actors.external_subject,
            tenants.display_name as tenant_display_name,
            array(
              select role_name from (
                select memberships.role as role_name
                from orbit.memberships as memberships
                where memberships.tenant_id = actors.tenant_id and memberships.actor_id = actors.id
                union
                select custom_roles.name as role_name
                from orbit.custom_role_assignments as assignments
                join orbit.custom_roles on custom_roles.tenant_id = assignments.tenant_id and custom_roles.id = assignments.role_id
                where assignments.tenant_id = actors.tenant_id and assignments.actor_id = actors.id
              ) as assigned_roles order by role_name
            ) as roles,
            array(
              select distinct permissions.permission
              from orbit.custom_role_assignments as assignments
              join orbit.custom_role_permissions as permissions
                on permissions.tenant_id = assignments.tenant_id and permissions.role_id = assignments.role_id
              where assignments.tenant_id = actors.tenant_id and assignments.actor_id = actors.id
              order by permissions.permission
            ) as explicit_permissions
          from orbit.actors as actors
          join orbit.tenants as tenants on tenants.id = actors.tenant_id
          where actors.tenant_id = ${credential.tenant_id}::uuid
            and actors.id = ${credential.actor_id}::uuid
        `.execute(transaction);
        const row = identity.rows[0];
        return row === undefined
          ? null
          : toStoredCredential({
              ...credential,
              ...row,
            });
      },
    );
  }

  async findSessionByTokenDigest(
    tokenDigest: string,
    observedAt: Date,
  ): Promise<SessionContext | null> {
    const lookup = await sql<{
      actor_id: string;
      created_at: Date;
      expires_at: Date;
      session_id: string;
      tenant_id: string;
    }>`
      select
        id as session_id,
        tenant_id,
        actor_id,
        created_at,
        expires_at
      from orbit.auth_sessions
      where token_sha256 = ${tokenDigest}
        and revoked_at is null
        and expires_at > ${observedAt}
    `.execute(this.database);
    const session = lookup.rows[0];
    if (session === undefined) {
      return null;
    }

    await sql`
      update orbit.auth_sessions
      set last_seen_at = ${observedAt}
      where tenant_id = ${session.tenant_id}::uuid
        and id = ${session.session_id}::uuid
    `.execute(this.database);

    return withTenantTransaction(
      this.database,
      session.tenant_id,
      async (transaction) => {
        const identity = await sql<{
          external_subject: string;
          explicit_permissions: readonly string[];
          roles: readonly string[];
          tenant_display_name: string;
        }>`
          select
            actors.external_subject,
            tenants.display_name as tenant_display_name,
            array(
              select role_name from (
                select memberships.role as role_name
                from orbit.memberships as memberships
                where memberships.tenant_id = actors.tenant_id and memberships.actor_id = actors.id
                union
                select custom_roles.name as role_name
                from orbit.custom_role_assignments as assignments
                join orbit.custom_roles on custom_roles.tenant_id = assignments.tenant_id and custom_roles.id = assignments.role_id
                where assignments.tenant_id = actors.tenant_id and assignments.actor_id = actors.id
              ) as assigned_roles order by role_name
            ) as roles,
            array(
              select distinct permissions.permission
              from orbit.custom_role_assignments as assignments
              join orbit.custom_role_permissions as permissions
                on permissions.tenant_id = assignments.tenant_id and permissions.role_id = assignments.role_id
              where assignments.tenant_id = actors.tenant_id and assignments.actor_id = actors.id
              order by permissions.permission
            ) as explicit_permissions
          from orbit.actors as actors
          join orbit.tenants as tenants on tenants.id = actors.tenant_id
          join orbit.auth_credentials as credentials
            on credentials.tenant_id = actors.tenant_id
            and credentials.actor_id = actors.id
          where actors.tenant_id = ${session.tenant_id}::uuid
            and actors.id = ${session.actor_id}::uuid
            and credentials.enabled = true
        `.execute(transaction);
        const row = identity.rows[0];
        if (row === undefined) {
          return null;
        }
        return sessionContextSchema.parse({
          actor: {
            actorId: session.actor_id,
            subject: row.external_subject,
          },
          authenticatedAt: session.created_at.toISOString(),
          expiresAt: session.expires_at.toISOString(),
          permissions: permissionsForRoles(row.roles, row.explicit_permissions),
          roles: row.roles,
          schemaVersion: "1",
          tenant: {
            displayName: row.tenant_display_name,
            tenantId: session.tenant_id,
          },
        });
      },
    );
  }

  async recordAuthenticationFailure(
    credential: StoredCredential,
    failedAuthenticationCount: number,
    lockedUntil: Date | null,
  ): Promise<void> {
    await sql`
      update orbit.auth_credentials
      set
        failed_authentication_count = ${failedAuthenticationCount},
        locked_until = ${lockedUntil}
      where tenant_id = ${credential.tenantId}::uuid
        and actor_id = ${credential.actorId}::uuid
    `.execute(this.database);
  }

  async recordAuthenticationSuccess(
    credential: StoredCredential,
    authenticatedAt: Date,
  ): Promise<void> {
    await sql`
      update orbit.auth_credentials
      set
        failed_authentication_count = 0,
        locked_until = null,
        last_authenticated_at = ${authenticatedAt}
      where tenant_id = ${credential.tenantId}::uuid
        and actor_id = ${credential.actorId}::uuid
    `.execute(this.database);
  }

  async revokeSession(tokenDigest: string, revokedAt: Date): Promise<void> {
    await sql`
      update orbit.auth_sessions
      set revoked_at = ${revokedAt}
      where token_sha256 = ${tokenDigest}
        and revoked_at is null
    `.execute(this.database);
  }
}

export class PostgresEvidenceCatalog {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async record(evidence: DurableEvidenceObject): Promise<void> {
    await withTenantTransaction(this.database, evidence.tenantId, async (transaction) => {
      await sql`
        insert into orbit.evidence_objects (
          tenant_id, id, integration_id, provider, independence_group,
          object_uri, payload_sha256, byte_length, observed_at, schema_version
        ) values (
          ${evidence.tenantId}::uuid,
          ${evidence.evidenceId}::uuid,
          ${evidence.integrationId}::uuid,
          ${evidence.provider},
          ${evidence.independenceGroup},
          ${evidence.objectUri},
          ${evidence.sha256},
          ${evidence.byteLength}::bigint,
          ${evidence.observedAt},
          '1'
        )
        on conflict (tenant_id, id) do nothing
      `.execute(transaction);

      await sql`
        insert into orbit.source_records (
          tenant_id, id, integration_id, evidence_id, external_object_type,
          external_object_id, external_revision, source_lifecycle, schema_version
        ) values (
          ${evidence.tenantId}::uuid,
          ${evidence.evidenceId}::uuid,
          ${evidence.integrationId}::uuid,
          ${evidence.evidenceId}::uuid,
          ${evidence.attributes.method ?? "rpc"},
          ${evidence.attributes.requestFingerprint ?? evidence.evidenceId},
          ${evidence.sha256},
          'observed',
          '1'
        )
        on conflict do nothing
      `.execute(transaction);
    });
  }
}

interface IngestionRunRow {
  readonly checkpoint_block: string | null;
  readonly completed_at: Date | null;
  readonly end_block: string;
  readonly failure_code: string | null;
  readonly id: string;
  readonly integration_id: string;
  readonly movement_count: string;
  readonly quarantine_count: string;
  readonly start_block: string;
  readonly started_at: Date;
  readonly state: IngestionRun["state"];
  readonly tenant_id: string;
}

function toIngestionRun(row: IngestionRunRow): IngestionRun {
  return ingestionRunSchema.parse({
    ...(row.checkpoint_block === null ? {} : { checkpointBlock: row.checkpoint_block }),
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at.toISOString() }),
    endBlock: row.end_block,
    ...(row.failure_code === null ? {} : { failureCode: row.failure_code }),
    integrationId: row.integration_id,
    movementCount: row.movement_count,
    quarantineCount: row.quarantine_count,
    runId: row.id,
    schemaVersion: "1",
    startedAt: row.started_at.toISOString(),
    startBlock: row.start_block,
    state: row.state,
    tenantId: row.tenant_id,
  });
}

interface MovementRow {
  readonly block_hash: string;
  readonly block_number: string;
  readonly chain_id: "56" | "97";
  readonly decimals: number | null;
  readonly evidence_ids: readonly string[];
  readonly effective_at: Date;
  readonly fee_payer_source: CanonicalChainMovement["feePayerSource"] | null;
  readonly from_address: string;
  readonly id: string;
  readonly integration_id: string;
  readonly kind: CanonicalChainMovement["kind"];
  readonly log_index: string | null;
  readonly metadata_source: string;
  readonly normalized_state: CanonicalChainMovement["normalizedState"];
  readonly observed_at: Date;
  readonly observed_state: CanonicalChainMovement["observedState"];
  readonly parser_version: string;
  readonly quantity_atomic: string;
  readonly quantity_display: string | null;
  readonly symbol: string | null;
  readonly tenant_id: string;
  readonly to_address: string | null;
  readonly token_contract: string | null;
  readonly transaction_hash: string;
}

function toMovement(row: MovementRow): CanonicalChainMovement {
  return canonicalChainMovementSchema.parse({
    asset: {
      ...(row.token_contract === null ? {} : { contractAddress: row.token_contract }),
      ...(row.decimals === null ? {} : { decimals: row.decimals }),
      metadataSource: row.metadata_source,
      network: `bsc:${row.chain_id}`,
      ...(row.symbol === null ? {} : { symbol: row.symbol }),
    },
    blockHash: row.block_hash,
    blockNumber: row.block_number,
    evidenceIds: row.evidence_ids,
    effectiveAt: row.effective_at.toISOString(),
    ...(row.fee_payer_source === null ? {} : { feePayerSource: row.fee_payer_source }),
    fromAddress: row.from_address,
    integrationId: row.integration_id,
    kind: row.kind,
    ...(row.log_index === null ? {} : { logIndex: row.log_index }),
    movementId: row.id,
    network: { chainId: row.chain_id, family: "evm" },
    normalizedState: row.normalized_state,
    observedAt: row.observed_at.toISOString(),
    observedState: row.observed_state,
    parserVersion: row.parser_version,
    quantityAtomic: row.quantity_atomic,
    ...(row.quantity_display === null ? {} : { quantityDisplay: row.quantity_display }),
    schemaVersion: "1",
    tenantId: row.tenant_id,
    ...(row.to_address === null ? {} : { toAddress: row.to_address }),
    transactionHash: row.transaction_hash,
  });
}

const runColumns = sql.raw(`
  tenant_id, id, integration_id, state, start_block, end_block,
  checkpoint_block, movement_count::text as movement_count,
  quarantine_count::text as quarantine_count, failure_code, started_at, completed_at
`);

const movementColumns = sql.raw(`
  tenant_id, id, integration_id, kind, chain_id, transaction_hash, log_index,
  block_number, block_hash, from_address, to_address, token_contract,
  quantity_atomic, quantity_display, decimals, symbol, metadata_source,
  evidence_ids, parser_version, observed_state, normalized_state,
  fee_payer_source, observed_at
  , effective_at
`);

export interface PostgresIngestionRepositoryOptions {
  readonly clock?: () => Date;
  readonly idGenerator?: () => string;
}

export class PostgresIngestionRepository implements IngestionRepository {
  private readonly clock: () => Date;
  private readonly idGenerator: () => string;

  constructor(
    private readonly database: Kysely<DatabaseSchema>,
    options: PostgresIngestionRepositoryOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
  }

  async acquireLease(tenantId: string, runId: string, ownerId: string, ttlMilliseconds: number) {
    if (!Number.isSafeInteger(ttlMilliseconds) || ttlMilliseconds < 1_000 || ttlMilliseconds > 300_000) {
      throw new RangeError("Lease TTL must be between 1 and 300 seconds");
    }
    const token = randomBytes(32).toString("base64url");
    const digest = createHash("sha256").update(token).digest("hex");
    const acquiredAt = this.clock();
    const expiresAt = new Date(acquiredAt.getTime() + ttlMilliseconds);
    return withTenantTransaction(this.database, tenantId, async (transaction) => {
      const result = await sql<{ expires_at: Date }>`
        insert into orbit.ingestion_run_leases (
          tenant_id, run_id, owner_id, lease_token_sha256,
          acquired_at, expires_at, heartbeat_at
        ) values (
          ${tenantId}::uuid, ${runId}::uuid, ${ownerId}, ${digest},
          ${acquiredAt}, ${expiresAt}, ${acquiredAt}
        )
        on conflict (tenant_id, run_id) do update
        set owner_id = excluded.owner_id,
            lease_token_sha256 = excluded.lease_token_sha256,
            acquired_at = excluded.acquired_at,
            expires_at = excluded.expires_at,
            heartbeat_at = excluded.heartbeat_at
        where orbit.ingestion_run_leases.expires_at <= ${acquiredAt}
        returning expires_at
      `.execute(transaction);
      return result.rows[0] === undefined
        ? null
        : { expiresAt: result.rows[0].expires_at.toISOString(), token };
    });
  }

  async renewLease(tenantId: string, runId: string, token: string, ttlMilliseconds: number) {
    if (!Number.isSafeInteger(ttlMilliseconds) || ttlMilliseconds < 1_000 || ttlMilliseconds > 300_000) {
      throw new RangeError("Lease TTL must be between 1 and 300 seconds");
    }
    const digest = createHash("sha256").update(token).digest("hex");
    const heartbeatAt = this.clock();
    const expiresAt = new Date(heartbeatAt.getTime() + ttlMilliseconds);
    return withTenantTransaction(this.database, tenantId, async (transaction) => {
      const result = await sql<{ expires_at: Date }>`
        update orbit.ingestion_run_leases
        set heartbeat_at = ${heartbeatAt},
            expires_at = ${expiresAt}
        where tenant_id = ${tenantId}::uuid
          and run_id = ${runId}::uuid
          and lease_token_sha256 = ${digest}
          and expires_at > ${heartbeatAt}
        returning expires_at
      `.execute(transaction);
      return result.rows[0] === undefined
        ? null
        : { expiresAt: result.rows[0].expires_at.toISOString() };
    });
  }

  async createRun(command: CreateRunCommand): Promise<IngestionRun> {
    if (BigInt(command.endBlock) < BigInt(command.startBlock)) {
      throw new RangeError("endBlock must not be before startBlock");
    }
    const id = this.idGenerator();
    const startedAt = this.clock();
    return withTenantTransaction(this.database, command.tenantId, async (transaction) => {
      const result = await sql<IngestionRunRow>`
        insert into orbit.ingestion_runs (
          tenant_id, id, integration_id, state, start_block, end_block, started_at
        ) values (
          ${command.tenantId}::uuid, ${id}::uuid, ${command.integrationId}::uuid,
          'queued', ${command.startBlock}, ${command.endBlock}, ${startedAt}
        )
        returning ${runColumns}
      `.execute(transaction);
      return toIngestionRun(result.rows[0] as IngestionRunRow);
    });
  }

  async completeBlock(command: CompleteBlockCommand): Promise<IngestionRun> {
    return withTenantTransaction(this.database, command.tenantId, async (transaction) => {
      for (const input of command.movements) {
        const movement = canonicalChainMovementSchema.parse(input);
        const discriminator = movement.logIndex ?? "fee";
        await sql`
          insert into orbit.canonical_movements (
            tenant_id, id, integration_id, kind, chain_id, transaction_hash,
            movement_discriminator, log_index, block_number, block_hash,
            from_address, to_address, token_contract, quantity_atomic,
            quantity_display, decimals, symbol, metadata_source, evidence_ids,
            parser_version, observed_state, normalized_state, fee_payer_source,
            effective_at, observed_at
          ) values (
            ${movement.tenantId}::uuid, ${movement.movementId}::uuid,
            ${movement.integrationId}::uuid, ${movement.kind},
            ${movement.network.chainId}, ${movement.transactionHash},
            ${discriminator}, ${movement.logIndex ?? null}, ${movement.blockNumber},
            ${movement.blockHash}, ${movement.fromAddress},
            ${movement.toAddress ?? null}, ${movement.asset.contractAddress ?? null},
            ${movement.quantityAtomic}, ${movement.quantityDisplay ?? null},
            ${movement.asset.decimals ?? null}, ${movement.asset.symbol ?? null},
            ${movement.asset.metadataSource}, ${movement.evidenceIds}::uuid[],
            ${movement.parserVersion}, ${movement.observedState},
            ${movement.normalizedState}, ${movement.feePayerSource ?? null},
            ${movement.effectiveAt}, ${movement.observedAt}
          )
          on conflict (tenant_id, integration_id, chain_id, transaction_hash, movement_discriminator)
          do nothing
        `.execute(transaction);
      }

      await sql`
        insert into orbit.ingestion_checkpoints (
          tenant_id, run_id, block_number, movement_count, completed_at
        ) values (
          ${command.tenantId}::uuid, ${command.runId}::uuid,
          ${command.blockNumber}, ${command.movements.length}, ${this.clock()}
        )
        on conflict (tenant_id, run_id, block_number) do nothing
      `.execute(transaction);

      const result = await sql<IngestionRunRow>`
        update orbit.ingestion_runs as runs
        set checkpoint_block = ${command.blockNumber},
            movement_count = (
              select count(*) from orbit.canonical_movements as movements
              where movements.tenant_id = runs.tenant_id
                and movements.integration_id = runs.integration_id
            ),
            state = case when ${command.blockNumber}::numeric >= runs.end_block::numeric
              then 'completed' else 'running' end,
            completed_at = case when ${command.blockNumber}::numeric >= runs.end_block::numeric
              then ${this.clock()}::timestamptz else null::timestamptz end,
            failure_code = null
        where id = ${command.runId}::uuid
          and (checkpoint_block is null or ${command.blockNumber}::numeric >= checkpoint_block::numeric)
        returning ${runColumns}
      `.execute(transaction);
      const row = result.rows[0];
      if (row === undefined) throw new Error("Ingestion run was not found");
      return toIngestionRun(row);
    });
  }

  async getRun(tenantId: string, runId: string): Promise<IngestionRun | null> {
    return withTenantTransaction(this.database, tenantId, async (transaction) => {
      const result = await sql<IngestionRunRow>`
        select ${runColumns} from orbit.ingestion_runs where id = ${runId}::uuid
      `.execute(transaction);
      return result.rows[0] === undefined ? null : toIngestionRun(result.rows[0]);
    });
  }

  async listMovements(tenantId: string, integrationId?: string): Promise<readonly CanonicalChainMovement[]> {
    return withTenantTransaction(this.database, tenantId, async (transaction) => {
      const result = integrationId === undefined
        ? await sql<MovementRow>`select ${movementColumns} from orbit.canonical_movements order by block_number::numeric, transaction_hash, movement_discriminator`.execute(transaction)
        : await sql<MovementRow>`select ${movementColumns} from orbit.canonical_movements where integration_id = ${integrationId}::uuid order by block_number::numeric, transaction_hash, movement_discriminator`.execute(transaction);
      return result.rows.map(toMovement);
    });
  }

  async listRuns(tenantId: string, integrationId?: string): Promise<readonly IngestionRun[]> {
    return withTenantTransaction(this.database, tenantId, async (transaction) => {
      const result = integrationId === undefined
        ? await sql<IngestionRunRow>`select ${runColumns} from orbit.ingestion_runs order by started_at desc, id`.execute(transaction)
        : await sql<IngestionRunRow>`select ${runColumns} from orbit.ingestion_runs where integration_id = ${integrationId}::uuid order by started_at desc, id`.execute(transaction);
      return result.rows.map(toIngestionRun);
    });
  }

  async quarantine(command: QuarantineCommand) {
    return withTenantTransaction(this.database, command.tenantId, async (transaction) => {
      const quarantineId = this.idGenerator();
      const createdAt = this.clock();
      const inserted = await sql<{
        block_number: string;
        created_at: Date;
        evidence_ids: readonly string[];
        id: string;
        integration_id: string;
        reason_code: string;
        run_id: string;
        tenant_id: string;
      }>`
        insert into orbit.ingestion_quarantine (
          tenant_id, id, run_id, integration_id, block_number,
          reason_code, evidence_ids, created_at
        ) values (
          ${command.tenantId}::uuid, ${quarantineId}::uuid, ${command.runId}::uuid,
          ${command.integrationId}::uuid, ${command.blockNumber},
          ${command.reasonCode}, ${command.evidenceIds}::uuid[], ${createdAt}
        )
        on conflict (tenant_id, run_id, block_number, reason_code) do nothing
        returning tenant_id, id, run_id, integration_id, block_number,
          reason_code, evidence_ids, created_at
      `.execute(transaction);
      await sql`
        update orbit.ingestion_runs as runs
        set state = 'failed',
            failure_code = ${command.reasonCode},
            quarantine_count = (
              select count(*) from orbit.ingestion_quarantine as quarantine
              where quarantine.tenant_id = runs.tenant_id and quarantine.run_id = runs.id
            )
        where id = ${command.runId}::uuid
      `.execute(transaction);
      const row = inserted.rows[0];
      if (row === undefined) {
        const existing = await sql<typeof inserted.rows[number]>`
          select tenant_id, id, run_id, integration_id, block_number,
            reason_code, evidence_ids, created_at
          from orbit.ingestion_quarantine
          where run_id = ${command.runId}::uuid
            and block_number = ${command.blockNumber}
            and reason_code = ${command.reasonCode}
        `.execute(transaction);
        if (existing.rows[0] === undefined) throw new Error("Quarantine record was not found");
        return ingestionQuarantineSchema.parse({
          ...existing.rows[0],
          blockNumber: existing.rows[0].block_number,
          createdAt: existing.rows[0].created_at.toISOString(),
          evidenceIds: existing.rows[0].evidence_ids,
          integrationId: existing.rows[0].integration_id,
          quarantineId: existing.rows[0].id,
          reasonCode: existing.rows[0].reason_code,
          runId: existing.rows[0].run_id,
          schemaVersion: "1",
          tenantId: existing.rows[0].tenant_id,
        });
      }
      return ingestionQuarantineSchema.parse({
        blockNumber: row.block_number,
        createdAt: row.created_at.toISOString(),
        evidenceIds: row.evidence_ids,
        integrationId: row.integration_id,
        quarantineId: row.id,
        reasonCode: row.reason_code,
        runId: row.run_id,
        schemaVersion: "1",
        tenantId: row.tenant_id,
      });
    });
  }

  async releaseLease(tenantId: string, runId: string, token: string): Promise<boolean> {
    const digest = createHash("sha256").update(token).digest("hex");
    return withTenantTransaction(this.database, tenantId, async (transaction) => {
      const result = await sql`
        delete from orbit.ingestion_run_leases
        where run_id = ${runId}::uuid and lease_token_sha256 = ${digest}
      `.execute(transaction);
      return (result.numAffectedRows ?? 0n) > 0n;
    });
  }

  async setRunState(tenantId: string, runId: string, state: IngestionRun["state"], failureCode?: string): Promise<IngestionRun | null> {
    return withTenantTransaction(this.database, tenantId, async (transaction) => {
      const result = await sql<IngestionRunRow>`
        update orbit.ingestion_runs
        set state = ${state}, failure_code = ${failureCode ?? null}
        where id = ${runId}::uuid
        returning ${runColumns}
      `.execute(transaction);
      return result.rows[0] === undefined ? null : toIngestionRun(result.rows[0]);
    });
  }
}

interface VerificationDecisionRow {
  readonly agreement_state: VerificationDecision["agreement"];
  readonly decided_at: Date;
  readonly evidence_ids: readonly string[];
  readonly execution_state: VerificationDecision["execution"];
  readonly finality_state: VerificationDecision["finality"];
  readonly id: string;
  readonly inclusion_state: VerificationDecision["inclusion"];
  readonly movement_id: string;
  readonly observations: VerificationDecision["observations"];
  readonly policy_id: string;
  readonly policy_version: string;
  readonly reason_codes: readonly string[];
  readonly supersedes_decision_id: string | null;
  readonly tenant_id: string;
  readonly verification_state: VerificationDecision["verification"];
}

function toVerificationDecision(row: VerificationDecisionRow): VerificationDecision {
  return verificationDecisionSchema.parse({
    agreement: row.agreement_state,
    decidedAt: row.decided_at.toISOString(),
    decisionId: row.id,
    evidenceIds: row.evidence_ids,
    execution: row.execution_state,
    finality: row.finality_state,
    inclusion: row.inclusion_state,
    movementId: row.movement_id,
    observations: row.observations,
    policyId: row.policy_id,
    policyVersion: row.policy_version,
    reasonCodes: row.reason_codes,
    schemaVersion: "1",
    ...(row.supersedes_decision_id === null ? {} : { supersedesDecisionId: row.supersedes_decision_id }),
    tenantId: row.tenant_id,
    verification: row.verification_state,
  });
}

export class PostgresVerificationDecisionStore implements VerificationDecisionStore {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  append(rawDecision: VerificationDecision): Promise<void> {
    const decision = verificationDecisionSchema.parse(rawDecision);
    return withTenantTransaction(this.database, decision.tenantId, async (transaction) => {
      await sql`
        insert into orbit.verification_decisions (
          tenant_id, id, movement_id, policy_id, policy_version,
          supersedes_decision_id, verification_state, inclusion_state,
          execution_state, finality_state, agreement_state, observations,
          evidence_ids, reason_codes, decided_at
        ) values (
          ${decision.tenantId}::uuid, ${decision.decisionId}::uuid,
          ${decision.movementId}::uuid, ${decision.policyId}::uuid,
          ${decision.policyVersion}, ${decision.supersedesDecisionId ?? null}::uuid,
          ${decision.verification}, ${decision.inclusion}, ${decision.execution},
          ${decision.finality}, ${decision.agreement},
          ${JSON.stringify(decision.observations)}::jsonb,
          ${decision.evidenceIds}::uuid[], ${decision.reasonCodes}::text[],
          ${decision.decidedAt}::timestamptz
        )
      `.execute(transaction);
    });
  }

  listForMovement(tenantId: string, movementId: string): Promise<readonly VerificationDecision[]> {
    return withTenantTransaction(this.database, tenantId, async (transaction) => {
      const result = await sql<VerificationDecisionRow>`
        select tenant_id, id, movement_id, policy_id, policy_version,
          supersedes_decision_id, verification_state, inclusion_state,
          execution_state, finality_state, agreement_state, observations,
          evidence_ids, reason_codes, decided_at
        from orbit.verification_decisions
        where movement_id = ${movementId}::uuid
        order by decided_at, id
      `.execute(transaction);
      return result.rows.map(toVerificationDecision);
    });
  }
}

export class PostgresVerificationPolicyStore implements VerificationPolicyStore {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  getByVersion(tenantId: string, version: string): Promise<VerificationPolicy | null> {
    return withTenantTransaction(this.database, tenantId, async (transaction) => {
      const result = await sql<{
        created_at: Date;
        finality_mode: VerificationPolicy["finalityMode"];
        id: string;
        minimum_confirmations: string | null;
        minimum_independent_providers: number;
        require_execution: boolean;
        require_inclusion: boolean;
        tenant_id: string;
        version: string;
      }>`
        select tenant_id, id, version, minimum_independent_providers,
          finality_mode, minimum_confirmations, require_inclusion,
          require_execution, created_at
        from orbit.verification_policies
        where version = ${version}
      `.execute(transaction);
      const row = result.rows[0];
      if (row === undefined) return null;
      return verificationPolicySchema.parse({
        createdAt: row.created_at.toISOString(),
        finalityMode: row.finality_mode,
        ...(row.minimum_confirmations === null ? {} : { minimumConfirmations: Number(row.minimum_confirmations) }),
        minimumIndependentProviders: row.minimum_independent_providers,
        policyId: row.id,
        requireExecution: row.require_execution,
        requireInclusion: row.require_inclusion,
        schemaVersion: "1",
        tenantId: row.tenant_id,
        version: row.version,
      });
    });
  }
}

interface ReconciliationResultRow {
  readonly asset_id: string;
  readonly completed_at: Date;
  readonly customer_id?: string | null;
  readonly cutoff: Date;
  readonly difference_atomic: string | null;
  readonly excluded_movement_ids: readonly string[];
  readonly expected_closing_quantity_atomic: string;
  readonly fee_quantity_atomic: string;
  readonly id: string;
  readonly incoming_quantity_atomic: string;
  readonly observed_closing_quantity_atomic: string | null;
  readonly opening_quantity_atomic: string;
  readonly outgoing_quantity_atomic: string;
  readonly policy_version: string;
  readonly state: PositionReconciliation["state"];
  readonly tenant_id: string;
  readonly verified_movement_ids: readonly string[];
  readonly wallet_address: string;
}

function toPositionReconciliation(row: ReconciliationResultRow, exceptionCount: string): PositionReconciliation {
  return positionReconciliationSchema.parse({
    assetId: row.asset_id,
    completedAt: row.completed_at.toISOString(),
    ...(typeof row.customer_id === "string" ? { customerId: row.customer_id } : {}),
    cutoff: row.cutoff.toISOString(),
    ...(row.difference_atomic === null ? {} : { differenceAtomic: row.difference_atomic }),
    exceptionCount,
    excludedMovementIds: row.excluded_movement_ids,
    expectedClosingQuantityAtomic: row.expected_closing_quantity_atomic,
    feeQuantityAtomic: row.fee_quantity_atomic,
    incomingQuantityAtomic: row.incoming_quantity_atomic,
    ...(row.observed_closing_quantity_atomic === null ? {} : { observedClosingQuantityAtomic: row.observed_closing_quantity_atomic }),
    openingQuantityAtomic: row.opening_quantity_atomic,
    outgoingQuantityAtomic: row.outgoing_quantity_atomic,
    policyVersion: row.policy_version,
    reconciliationId: row.id,
    schemaVersion: "1",
    state: row.state,
    tenantId: row.tenant_id,
    verifiedMovementIds: row.verified_movement_ids,
    walletAddress: row.wallet_address,
  });
}

interface OperationalExceptionRow {
  readonly affected_resource_id: string;
  readonly affected_resource_type: OperationalException["affectedResourceType"];
  readonly created_at: Date;
  readonly id: string;
  readonly owner_actor_id: string | null;
  readonly reason_code: string;
  readonly resolution_reason_code: string | null;
  readonly severity: OperationalException["severity"];
  readonly stable_key: string;
  readonly state: OperationalException["state"];
  readonly tenant_id: string;
  readonly updated_at: Date;
}

function toOperationalException(row: OperationalExceptionRow): OperationalException {
  return operationalExceptionSchema.parse({
    affectedResourceId: row.affected_resource_id,
    affectedResourceType: row.affected_resource_type,
    createdAt: row.created_at.toISOString(),
    exceptionId: row.id,
    ...(row.owner_actor_id === null ? {} : { ownerActorId: row.owner_actor_id }),
    reasonCode: row.reason_code,
    ...(row.resolution_reason_code === null ? {} : { resolutionReasonCode: row.resolution_reason_code }),
    schemaVersion: "1",
    severity: row.severity,
    stableKey: row.stable_key,
    state: row.state,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at.toISOString(),
  });
}

const reconciliationColumns = sql.raw(`
  tenant_id, id, customer_id, wallet_address, asset_id, cutoff, policy_version,
  opening_quantity_atomic, incoming_quantity_atomic, outgoing_quantity_atomic,
  fee_quantity_atomic, expected_closing_quantity_atomic,
  observed_closing_quantity_atomic, difference_atomic, state,
  verified_movement_ids, excluded_movement_ids, completed_at
`);

const exceptionColumns = sql.raw(`
  tenant_id, id, stable_key, reason_code, severity, state,
  affected_resource_type, affected_resource_id, owner_actor_id,
  resolution_reason_code, created_at, updated_at
`);

export interface PostgresReconciliationQueryServiceOptions {
  readonly clock?: () => Date;
  readonly idGenerator?: () => string;
}

export class PostgresReconciliationQueryService implements ReconciliationQueryService, ReconciliationWriter {
  private readonly clock: () => Date;
  private readonly idGenerator: () => string;

  constructor(
    private readonly database: Kysely<DatabaseSchema>,
    options: PostgresReconciliationQueryServiceOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
  }

  getException(tenantId: string, exceptionId: string): Promise<OperationalException | null> {
    return withTenantTransaction(this.database, tenantId, async (transaction) => {
      const result = await sql<OperationalExceptionRow>`select ${exceptionColumns} from orbit.operational_exceptions where id = ${exceptionId}::uuid`.execute(transaction);
      return result.rows[0] === undefined ? null : toOperationalException(result.rows[0]);
    });
  }

  getResult(tenantId: string, reconciliationId: string): Promise<PositionReconciliation | null> {
    return withTenantTransaction(this.database, tenantId, async (transaction) => {
      const result = await sql<ReconciliationResultRow>`select ${reconciliationColumns} from orbit.reconciliation_results where id = ${reconciliationId}::uuid`.execute(transaction);
      const row = result.rows[0];
      if (row === undefined) return null;
      const count = await sql<{ count: string }>`select count(*)::text as count from orbit.operational_exceptions where affected_resource_type = 'reconciliation' and affected_resource_id = ${reconciliationId}::uuid`.execute(transaction);
      return toPositionReconciliation(row, count.rows[0]?.count ?? "0");
    });
  }

  listExceptionEvents(tenantId: string, exceptionId: string): Promise<readonly ExceptionWorkflowEvent[]> {
    return withTenantTransaction(this.database, tenantId, async (transaction) => {
      const result = await sql<{
        action: "exception:updated";
        actor_id: string;
        after_state: OperationalException;
        before_state: OperationalException;
        exception_id: string;
        id: string;
        note: string | null;
        occurred_at: Date;
        tenant_id: string;
      }>`select tenant_id, id, exception_id, actor_id, action, note, before_state, after_state, occurred_at from orbit.exception_events where exception_id = ${exceptionId}::uuid order by occurred_at, id`.execute(transaction);
      return result.rows.map((row) => ({
        action: row.action,
        actorId: row.actor_id,
        after: operationalExceptionSchema.parse(row.after_state),
        before: operationalExceptionSchema.parse(row.before_state),
        eventId: row.id,
        exceptionId: row.exception_id,
        ...(row.note === null ? {} : { note: row.note }),
        occurredAt: row.occurred_at.toISOString(),
        tenantId: row.tenant_id,
      }));
    });
  }

  listExceptions(tenantId: string): Promise<readonly OperationalException[]> {
    return withTenantTransaction(this.database, tenantId, async (transaction) => {
      const result = await sql<OperationalExceptionRow>`select ${exceptionColumns} from orbit.operational_exceptions order by state, severity desc, updated_at, id`.execute(transaction);
      return result.rows.map(toOperationalException);
    });
  }

  listResults(tenantId: string, customerId?: string): Promise<readonly PositionReconciliation[]> {
    return withTenantTransaction(this.database, tenantId, async (transaction) => {
      const result = customerId === undefined
        ? await sql<ReconciliationResultRow & { exception_count: string }>`
            select results.*, count(exceptions.id)::text as exception_count
            from orbit.reconciliation_results as results
            left join orbit.operational_exceptions as exceptions
              on exceptions.tenant_id = results.tenant_id
              and exceptions.affected_resource_type = 'reconciliation'
              and exceptions.affected_resource_id = results.id
            group by results.tenant_id, results.id
            order by results.cutoff desc, results.id
          `.execute(transaction)
        : await sql<ReconciliationResultRow & { exception_count: string }>`
            select results.*, count(exceptions.id)::text as exception_count
            from orbit.reconciliation_results as results
            left join orbit.operational_exceptions as exceptions
              on exceptions.tenant_id = results.tenant_id
              and exceptions.affected_resource_type = 'reconciliation'
              and exceptions.affected_resource_id = results.id
            where results.customer_id = ${customerId}::uuid
            group by results.tenant_id, results.id
            order by results.cutoff desc, results.id
          `.execute(transaction);
      return result.rows.map((row) => toPositionReconciliation(row, row.exception_count));
    });
  }

  updateException(command: UpdateExceptionCommand): Promise<OperationalException | null> {
    const changes = updateOperationalExceptionRequestSchema.parse(command.changes);
    return withTenantTransaction(this.database, command.tenantId, async (transaction) => {
      const selected = await sql<OperationalExceptionRow>`select ${exceptionColumns} from orbit.operational_exceptions where id = ${command.exceptionId}::uuid for update`.execute(transaction);
      const row = selected.rows[0];
      if (row === undefined) return null;
      const before = toOperationalException(row);
      const nextState = changes.state ?? before.state;
      const resolutionReasonCode = changes.resolutionReasonCode ?? before.resolutionReasonCode;
      if (nextState === "resolved" && resolutionReasonCode === undefined) {
        throw new TypeError("Resolving an exception requires a resolution reason code");
      }
      const updatedAt = this.clock();
      const updated = await sql<OperationalExceptionRow>`
        update orbit.operational_exceptions
        set state = ${nextState},
            owner_actor_id = ${changes.ownerActorId === undefined ? before.ownerActorId ?? null : changes.ownerActorId}::uuid,
            resolution_reason_code = ${nextState === "resolved" ? resolutionReasonCode ?? null : null},
            updated_at = ${updatedAt}
        where id = ${command.exceptionId}::uuid
        returning ${exceptionColumns}
      `.execute(transaction);
      const after = toOperationalException(updated.rows[0] as OperationalExceptionRow);
      await sql`
        insert into orbit.exception_events (
          tenant_id, id, exception_id, actor_id, action, note,
          before_state, after_state, occurred_at
        ) values (
          ${command.tenantId}::uuid, ${this.idGenerator()}::uuid,
          ${command.exceptionId}::uuid, ${command.actorId}::uuid,
          'exception:updated', ${changes.note ?? null},
          ${JSON.stringify(before)}::jsonb, ${JSON.stringify(after)}::jsonb,
          ${updatedAt}
        )
      `.execute(transaction);
      return after;
    });
  }

  openVerificationConflict(decision: VerificationDecision): Promise<void> {
    if (decision.verification !== "conflicted" && decision.verification !== "invalidated") return Promise.resolve();
    return withTenantTransaction(this.database, decision.tenantId, async (transaction) => {
      const now = this.clock();
      const isReorganization = decision.verification === "invalidated";
      await sql`
        insert into orbit.operational_exceptions (
          tenant_id, id, stable_key, reason_code, severity, state,
          affected_resource_type, affected_resource_id, created_at, updated_at
        ) values (
          ${decision.tenantId}::uuid, ${this.idGenerator()}::uuid,
          ${`verification:${decision.movementId}:${decision.policyVersion}:${isReorganization ? "reorganization" : "provider_conflict"}`},
          ${isReorganization ? "verification:reorganization" : "verification:provider_conflict"}, 'error', 'open',
          'movement', ${decision.movementId}::uuid, ${now}, ${now}
        )
        on conflict (tenant_id, stable_key) do nothing
      `.execute(transaction);
    });
  }

  record(
    rawResult: PositionReconciliation,
    rawExceptions: readonly OperationalException[],
  ): Promise<PositionReconciliation> {
    const result = positionReconciliationSchema.parse(rawResult);
    const exceptions = rawExceptions.map((item) => operationalExceptionSchema.parse(item));
    return withTenantTransaction(this.database, result.tenantId, async (transaction) => {
      await sql`
        insert into orbit.reconciliation_results (
          tenant_id, id, customer_id, wallet_address, asset_id, cutoff, policy_version,
          opening_quantity_atomic, incoming_quantity_atomic, outgoing_quantity_atomic,
          fee_quantity_atomic, expected_closing_quantity_atomic,
          observed_closing_quantity_atomic, difference_atomic, state,
          verified_movement_ids, excluded_movement_ids, completed_at
        ) values (
          ${result.tenantId}::uuid, ${result.reconciliationId}::uuid,
          ${result.customerId ?? null}::uuid,
          ${result.walletAddress.toLowerCase()}, ${result.assetId}, ${result.cutoff}::timestamptz,
          ${result.policyVersion}, ${result.openingQuantityAtomic},
          ${result.incomingQuantityAtomic}, ${result.outgoingQuantityAtomic},
          ${result.feeQuantityAtomic}, ${result.expectedClosingQuantityAtomic},
          ${result.observedClosingQuantityAtomic ?? null}, ${result.differenceAtomic ?? null},
          ${result.state}, ${result.verifiedMovementIds}::uuid[],
          ${result.excludedMovementIds}::uuid[], ${result.completedAt}::timestamptz
        )
        on conflict (tenant_id, wallet_address, asset_id, cutoff, policy_version) do nothing
      `.execute(transaction);
      const selected = await sql<ReconciliationResultRow>`
        select ${reconciliationColumns}
        from orbit.reconciliation_results
        where wallet_address = ${result.walletAddress.toLowerCase()}
          and asset_id = ${result.assetId}
          and cutoff = ${result.cutoff}::timestamptz
          and policy_version = ${result.policyVersion}
      `.execute(transaction);
      const persisted = selected.rows[0];
      if (persisted === undefined) throw new Error("Reconciliation result was not persisted");
      for (const item of exceptions) {
        await sql`
          insert into orbit.operational_exceptions (
            tenant_id, id, stable_key, reason_code, severity, state,
            affected_resource_type, affected_resource_id, created_at, updated_at
          ) values (
            ${result.tenantId}::uuid, ${item.exceptionId}::uuid, ${item.stableKey},
            ${item.reasonCode}, ${item.severity}, ${item.state},
            'reconciliation', ${persisted.id}::uuid,
            ${item.createdAt}::timestamptz, ${item.updatedAt}::timestamptz
          )
          on conflict (tenant_id, stable_key) do nothing
        `.execute(transaction);
      }
      const count = await sql<{ count: string }>`
        select count(*)::text as count from orbit.operational_exceptions
        where affected_resource_type = 'reconciliation'
          and affected_resource_id = ${persisted.id}::uuid
      `.execute(transaction);
      return toPositionReconciliation(persisted, count.rows[0]?.count ?? "0");
    });
  }
}

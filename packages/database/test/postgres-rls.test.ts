import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import EmbeddedPostgres from "embedded-postgres";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword, PasswordSessionService } from "@orbitos/authz";

import {
  PostgresIntegrationRepository,
  PostgresCustomAuthRepository,
  PostgresIngestionRepository,
  PostgresReconciliationQueryService,
  PostgresVerificationDecisionStore,
  createDatabase,
  withTenantTransaction,
} from "../src/index.js";

const tenantA = "10000000-0000-4000-8000-000000000001";
const tenantB = "20000000-0000-4000-8000-000000000002";
const actorA = "30000000-0000-4000-8000-000000000003";
const appPassword = "orbit-local-test-password";
const operatorPassword = "OrbitOS test password 2026!";

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
  if (address === null || typeof address === "string") {
    throw new Error("Could not reserve a PostgreSQL test port");
  }
  return address.port;
}

describe("PostgreSQL tenant isolation", () => {
  let embedded: EmbeddedPostgres;
  let database: ReturnType<typeof createDatabase>;

  beforeAll(async () => {
    const databaseDir = await mkdtemp(join(tmpdir(), "orbit-postgres-"));
    const port = await reservePort();
    embedded = new EmbeddedPostgres({
      databaseDir,
      onLog: () => undefined,
      password: "orbit-postgres-admin",
      persistent: false,
      port,
      user: "postgres",
    });
    await embedded.initialise();
    await embedded.start();

    const admin = embedded.getPgClient();
    await admin.connect();
    try {
      const migrations = await Promise.all(
        [
          "0001_foundation.sql",
          "0002_sprint1_platform.sql",
          "0003_custom_auth.sql",
          "0004_sprint2_ingestion.sql",
          "0005_application_role.sql",
          "0006_supabase_hardening.sql",
          "0007_sprint3_verification.sql",
          "0008_sprint3_reconciliation.sql",
        ].map((file) =>
          readFile(
            fileURLToPath(new URL(`../migrations/${file}`, import.meta.url)),
            "utf8",
          ),
        ),
      );
      for (const migration of migrations) {
        await admin.query(migration);
      }
      await admin.query(`
        create role orbit_app login password '${appPassword}' nobypassrls;
        grant orbitos_app to orbit_app;
      `);
      await admin.query(
        `insert into orbit.tenants (id, display_name) values ($1, 'Tenant A'), ($2, 'Tenant B')`,
        [tenantA, tenantB],
      );
      await admin.query(
        `insert into orbit.actors (tenant_id, id, external_subject) values ($1, $2, 'actor-a')`,
        [tenantA, actorA],
      );
      await admin.query(
        `insert into orbit.memberships (tenant_id, actor_id, role) values ($1, $2, 'administrator')`,
        [tenantA, actorA],
      );
      await admin.query(
        `insert into orbit.auth_credentials (tenant_id, actor_id, email, password_hash) values ($1, $2, $3, $4)`,
        [
          tenantA,
          actorA,
          "orbitos@devlogix.com.pk",
          await hashPassword(operatorPassword),
        ],
      );
    } finally {
      await admin.end();
    }

    database = createDatabase(
      `postgresql://orbit_app:${appPassword}@127.0.0.1:${port}/postgres`,
      { max: 1 },
    );
  }, 60_000);

  afterAll(async () => {
    await database?.destroy();
    await embedded?.stop();
  });

  it("fails closed without tenant context and resets pooled context", async () => {
    const withoutContext = await sql<{ count: string }>`
      select count(*)::text as count from orbit.tenants
    `.execute(database);
    expect(withoutContext.rows[0]?.count).toBe("0");

    const withinTenant = await withTenantTransaction(
      database,
      tenantA,
      async (transaction) =>
        sql<{ id: string }>`select id from orbit.tenants`.execute(transaction),
    );
    expect(withinTenant.rows.map((row) => row.id)).toEqual([tenantA]);

    const reset = await sql<{ tenant_id: string | null }>`
      select nullif(current_setting('app.tenant_id', true), '') as tenant_id
    `.execute(database);
    expect(reset.rows[0]?.tenant_id).toBeNull();
  });

  it("rejects cross-tenant writes at the database boundary", async () => {
    await expect(
      withTenantTransaction(database, tenantA, async (transaction) => {
        await sql`
          insert into orbit.integrations (tenant_id, id, provider)
          values (
            ${tenantB}::uuid,
            '40000000-0000-4000-8000-000000000004'::uuid,
            'bsc-json-rpc'
          )
        `.execute(transaction);
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("persists and reads integrations only inside their tenant", async () => {
    const repository = new PostgresIntegrationRepository(database, {
      clock: () => new Date("2026-09-29T00:00:00.000Z"),
      idGenerator: (() => {
        const ids = [
          "50000000-0000-4000-8000-000000000005",
          "60000000-0000-4000-8000-000000000006",
        ];
        return () => ids.shift() ?? crypto.randomUUID();
      })(),
    });

    const result = await repository.create({
      actorId: actorA,
      configuration: {
        finalityPolicyVersion: "bsc-v1",
        network: { chainId: "97", family: "evm" },
        provider: "bsc-json-rpc",
        providerGroups: [
          {
            endpointReference: "env:BSC_TESTNET_RPC_URL",
            groupId: "primary",
            independenceGroup: "provider-a",
            secretReference: "env:BSC_TESTNET_RPC_TOKEN",
          },
        ],
        schemaVersion: "1",
        startingBlock: "0",
        tokenContracts: ["0x2222222222222222222222222222222222222222"],
        walletAddresses: ["0x1111111111111111111111111111111111111111"],
      },
      tenantId: tenantA,
    });

    expect(result.integration.tenantId).toBe(tenantA);
    expect(result.integration.providerGroups).toEqual([
      {
        groupId: "primary",
        hasSecretReference: true,
        independenceGroup: "provider-a",
      },
    ]);
    await expect(repository.listForTenant(tenantA)).resolves.toHaveLength(1);
    await expect(repository.listForTenant(tenantB)).resolves.toEqual([]);

    await expect(
      withTenantTransaction(database, tenantA, async (transaction) => {
        await sql`
          update orbit.audit_events
          set action = 'integration:changed'
          where id = ${result.auditEvent.auditEventId}::uuid
        `.execute(transaction);
      }),
    ).rejects.toThrow(/audit events are append-only|permission denied for table audit_events/u);
  });

  it("authenticates the staging user without persisting the bearer token", async () => {
    const repository = new PostgresCustomAuthRepository(database);
    const token = "a".repeat(43);
    const service = new PasswordSessionService(repository, {
      clock: () => new Date("2026-09-29T01:00:00.000Z"),
      idGenerator: () => "70000000-0000-4000-8000-000000000007",
      tokenGenerator: () => token,
    });

    const created = await service.createSession(
      "ORBITOS@DEVLOGIX.COM.PK",
      operatorPassword,
    );
    expect(created?.token).toBe(token);
    await expect(service.authenticate(token)).resolves.toMatchObject({
      actor: { actorId: actorA, subject: "actor-a" },
      permissions: [
        "evidence:read",
        "exceptions:read",
        "exceptions:write",
        "ingestion:read",
        "ingestion:write",
        "integrations:read",
        "integrations:write",
        "movements:read",
        "reconciliation:read",
        "reconciliation:write",
        "verification:read",
      ],
      roles: ["administrator"],
      tenant: { tenantId: tenantA },
    });

    const stored = await sql<{ count: string }>`
      select count(*)::text as count
      from orbit.auth_sessions
      where token_sha256 = ${token}
    `.execute(database);
    expect(stored.rows[0]?.count).toBe("0");

    await service.revokeSession(token);
    await expect(service.authenticate(token)).resolves.toBeNull();
  });

  it("persists replay-safe checkpoints and movements behind tenant RLS", async () => {
    const integrationId = "80000000-0000-4000-8000-000000000008";
    const integrations = new PostgresIntegrationRepository(database, {
      idGenerator: (() => {
        const ids = [integrationId, "81000000-0000-4000-8000-000000000008"];
        return () => ids.shift() ?? crypto.randomUUID();
      })(),
    });
    await integrations.create({
      actorId: actorA,
      configuration: {
        finalityPolicyVersion: "bsc-v1",
        network: { chainId: "97", family: "evm" },
        provider: "bsc-json-rpc",
        providerGroups: [{ endpointReference: "allowlist:testnet", groupId: "primary", independenceGroup: "provider-a" }],
        schemaVersion: "1",
        startingBlock: "10",
        tokenContracts: ["0x2222222222222222222222222222222222222222"],
        walletAddresses: ["0x1111111111111111111111111111111111111111"],
      },
      tenantId: tenantA,
    });
    const repository = new PostgresIngestionRepository(database, {
      clock: () => new Date("2026-09-29T12:00:00.000Z"),
      idGenerator: (() => {
        const ids = ["82000000-0000-4000-8000-000000000008"];
        return () => ids.shift() ?? crypto.randomUUID();
      })(),
    });
    const run = await repository.createRun({ endBlock: "10", integrationId, startBlock: "10", tenantId: tenantA });
    const lease = await repository.acquireLease(tenantA, run.runId, "worker-a", 30_000);
    expect(lease).not.toBeNull();
    await expect(repository.acquireLease(tenantA, run.runId, "worker-b", 30_000)).resolves.toBeNull();
    await expect(repository.renewLease(tenantA, run.runId, "wrong-token", 30_000)).resolves.toBeNull();
    await expect(repository.renewLease(tenantA, run.runId, lease?.token ?? "", 30_000)).resolves.not.toBeNull();
    const movement = {
      asset: { contractAddress: "0x2222222222222222222222222222222222222222", decimals: 18, metadataSource: "fixture:v1", network: "bsc:97", symbol: "TEST" },
      blockHash: `0x${"b".repeat(64)}`,
      blockNumber: "10",
      evidenceIds: ["83000000-0000-4000-8000-000000000008"],
      effectiveAt: "1970-01-01T00:00:01.000Z",
      fromAddress: "0x1111111111111111111111111111111111111111",
      integrationId,
      kind: "bep20_transfer" as const,
      logIndex: "0",
      movementId: "84000000-0000-4000-8000-000000000008",
      network: { chainId: "97" as const, family: "evm" as const },
      normalizedState: "normalized" as const,
      observedAt: "2026-09-29T12:00:00.000Z",
      observedState: "observed" as const,
      parserVersion: "bsc-bep20-v1",
      quantityAtomic: "340282366920938463463374607431768211455",
      quantityDisplay: "340282366920938463463.374607431768211455",
      schemaVersion: "1" as const,
      tenantId: tenantA,
      toAddress: "0x3333333333333333333333333333333333333333",
      transactionHash: `0x${"a".repeat(64)}`,
    };
    await repository.completeBlock({ blockNumber: "10", movements: [movement], runId: run.runId, tenantId: tenantA });
    await repository.completeBlock({ blockNumber: "10", movements: [{ ...movement, movementId: "85000000-0000-4000-8000-000000000008" }], runId: run.runId, tenantId: tenantA });

    await expect(repository.listMovements(tenantA, integrationId)).resolves.toHaveLength(1);
    await expect(repository.listMovements(tenantB)).resolves.toEqual([]);
    expect((await repository.getRun(tenantA, run.runId))?.state).toBe("completed");
    await expect(repository.releaseLease(tenantA, run.runId, lease?.token ?? "")).resolves.toBe(true);
  });

  it("persists immutable verification history and rejects illegal database transitions", async () => {
    const movementId = "84000000-0000-4000-8000-000000000008";
    const policyId = "86000000-0000-4000-8000-000000000008";
    await withTenantTransaction(database, tenantA, async (transaction) => {
      await sql`
        insert into orbit.verification_policies (
          tenant_id, id, version, minimum_independent_providers,
          finality_mode, require_inclusion, require_execution, created_at
        ) values (
          ${tenantA}::uuid, ${policyId}::uuid, 'bsc-v1', 2,
          'finalized_tag', true, true, '2026-09-29T12:01:00.000Z'
        )
      `.execute(transaction);
    });
    const repository = new PostgresVerificationDecisionStore(database);
    const decision = {
      agreement: "agreed" as const,
      decidedAt: "2026-09-29T12:02:00.000Z",
      decisionId: "87000000-0000-4000-8000-000000000008",
      evidenceIds: ["83000000-0000-4000-8000-000000000008"],
      execution: "succeeded" as const,
      finality: "final" as const,
      inclusion: "included" as const,
      movementId,
      observations: ["provider-a", "provider-b"].map((provider, index) => ({
        agreementKey: "97:10:block:tx:0",
        evidenceIds: ["83000000-0000-4000-8000-000000000008"],
        execution: "succeeded" as const,
        finality: "final" as const,
        finalityTag: "finalized" as const,
        inclusion: "included" as const,
        independenceGroup: `operator-${index}`,
        observedAt: "2026-09-29T12:01:30.000Z",
        provider,
        status: "available" as const,
      })),
      policyId,
      policyVersion: "bsc-v1",
      reasonCodes: ["verification:verified"],
      schemaVersion: "1" as const,
      tenantId: tenantA,
      verification: "verified" as const,
    };
    await repository.append(decision);
    await expect(repository.listForMovement(tenantA, movementId)).resolves.toEqual([decision]);
    await expect(repository.listForMovement(tenantB, movementId)).resolves.toEqual([]);

    await expect(repository.append({
      ...decision,
      agreement: "pending",
      decisionId: "88000000-0000-4000-8000-000000000008",
      finality: "pending",
      reasonCodes: ["verification:finality_pending"],
      supersedesDecisionId: decision.decisionId,
      verification: "pending",
    })).rejects.toThrow(/illegal verification transition/u);

    await expect(withTenantTransaction(database, tenantA, async (transaction) => {
      await sql`update orbit.verification_decisions set reason_codes = array['verification:changed'] where id = ${decision.decisionId}::uuid`.execute(transaction);
    })).rejects.toThrow(/append-only|permission denied/u);
  });

  it("keeps reconciliation exact and audits workflow-only exception updates", async () => {
    const reconciliationId = "89000000-0000-4000-8000-000000000008";
    const exceptionId = "8a000000-0000-4000-8000-000000000008";
    await withTenantTransaction(database, tenantA, async (transaction) => {
      await sql`
        insert into orbit.reconciliation_results (
          tenant_id, id, wallet_address, asset_id, cutoff, policy_version,
          opening_quantity_atomic, incoming_quantity_atomic, outgoing_quantity_atomic,
          fee_quantity_atomic, expected_closing_quantity_atomic,
          observed_closing_quantity_atomic, difference_atomic, state,
          verified_movement_ids, excluded_movement_ids, completed_at
        ) values (
          ${tenantA}::uuid, ${reconciliationId}::uuid,
          '0x1111111111111111111111111111111111111111', 'bsc:97:TEST',
          '2026-09-29T12:10:00.000Z', 'bsc-v1',
          '340282366920938463463374607431768211455', '1', '0', '0',
          '340282366920938463463374607431768211456',
          '340282366920938463463374607431768211455', '-1', 'mismatched',
          array['84000000-0000-4000-8000-000000000008']::uuid[],
          array[]::uuid[], '2026-09-29T12:11:00.000Z'
        )
      `.execute(transaction);
      await sql`
        insert into orbit.operational_exceptions (
          tenant_id, id, stable_key, reason_code, severity, state,
          affected_resource_type, affected_resource_id, created_at, updated_at
        ) values (
          ${tenantA}::uuid, ${exceptionId}::uuid, 'stable:amount',
          'reconciliation:amount_difference', 'error', 'open',
          'reconciliation', ${reconciliationId}::uuid,
          '2026-09-29T12:11:00.000Z', '2026-09-29T12:11:00.000Z'
        )
      `.execute(transaction);
    });
    const repository = new PostgresReconciliationQueryService(database, {
      clock: () => new Date("2026-09-29T12:12:00.000Z"),
      idGenerator: () => "8b000000-0000-4000-8000-000000000008",
    });
    await expect(repository.listResults(tenantA)).resolves.toEqual([
      expect.objectContaining({
        differenceAtomic: "-1",
        exceptionCount: "1",
        expectedClosingQuantityAtomic: "340282366920938463463374607431768211456",
      }),
    ]);
    await expect(repository.listResults(tenantB)).resolves.toEqual([]);
    await expect(repository.updateException({
      actorId: actorA,
      changes: {
        note: "Independent provider confirms the mismatch.",
        resolutionReasonCode: "exception:confirmed_difference",
        state: "resolved",
      },
      exceptionId,
      tenantId: tenantA,
    })).resolves.toMatchObject({
      affectedResourceId: reconciliationId,
      resolutionReasonCode: "exception:confirmed_difference",
      state: "resolved",
    });
    await expect(repository.listExceptionEvents(tenantA, exceptionId)).resolves.toEqual([
      expect.objectContaining({
        actorId: actorA,
        note: "Independent provider confirms the mismatch.",
      }),
    ]);

    await expect(withTenantTransaction(database, tenantA, async (transaction) => {
      await sql`update orbit.operational_exceptions set reason_code = 'reconciliation:changed' where id = ${exceptionId}::uuid`.execute(transaction);
    })).rejects.toThrow(/source facts are immutable/u);
  });
});

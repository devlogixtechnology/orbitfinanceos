import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../migrations/0001_foundation.sql", import.meta.url);
const sprintOneMigrationUrl = new URL(
  "../migrations/0002_sprint1_platform.sql",
  import.meta.url,
);
const customAuthMigrationUrl = new URL(
  "../migrations/0003_custom_auth.sql",
  import.meta.url,
);
const sprintTwoMigrationUrl = new URL(
  "../migrations/0004_sprint2_ingestion.sql",
  import.meta.url,
);
const applicationRoleMigrationUrl = new URL(
  "../migrations/0005_application_role.sql",
  import.meta.url,
);
const supabaseHardeningMigrationUrl = new URL(
  "../migrations/0006_supabase_hardening.sql",
  import.meta.url,
);
const sprintThreeVerificationMigrationUrl = new URL(
  "../migrations/0007_sprint3_verification.sql",
  import.meta.url,
);
const sprintThreeReconciliationMigrationUrl = new URL(
  "../migrations/0008_sprint3_reconciliation.sql",
  import.meta.url,
);
const resellerControlPlaneMigrationUrl = new URL(
  "../migrations/0009_reseller_control_plane.sql",
  import.meta.url,
);
const dataConnectionsMigrationUrl = new URL(
  "../migrations/0010_data_connections.sql",
  import.meta.url,
);
const customerIntegrationsMigrationUrl = new URL(
  "../migrations/0011_customer_integrations.sql",
  import.meta.url,
);

describe("foundation migration contract", () => {
  it("declares fail-closed tenant policies and tenant-safe relationships", async () => {
    const sql = await readFile(fileURLToPath(migrationUrl), "utf8");

    expect(sql).toContain("current_setting('app.tenant_id', true)");
    expect(sql.match(/FORCE ROW LEVEL SECURITY/gu)).toHaveLength(6);
    expect(sql).toContain("FOREIGN KEY (tenant_id, evidence_id)");
    expect(sql).toContain("evidence_objects_append_only");
    expect(sql).toContain("CREATE TABLE orbit.outbox_events");
  });

  it("adds tenant-scoped identities, memberships, audit, and BSC configuration", async () => {
    const sql = await readFile(fileURLToPath(sprintOneMigrationUrl), "utf8");

    expect(sql.match(/FORCE ROW LEVEL SECURITY/gu)).toHaveLength(3);
    expect(sql).toContain("CREATE TABLE orbit.actors");
    expect(sql).toContain("CREATE TABLE orbit.memberships");
    expect(sql).toContain("CREATE TABLE orbit.audit_events");
    expect(sql).toContain("FOREIGN KEY (tenant_id, actor_id)");
    expect(sql).toContain("audit_events_append_only");
    expect(sql).toContain("CHECK (chain_id IN ('56', '97'))");
  });

  it("stores only password hashes and opaque session-token digests", async () => {
    const sql = await readFile(fileURLToPath(customAuthMigrationUrl), "utf8");

    expect(sql).toContain("CREATE TABLE orbit.auth_credentials");
    expect(sql).toContain("password_hash LIKE '$scrypt$%'");
    expect(sql).toContain("CREATE TABLE orbit.auth_sessions");
    expect(sql).toContain("token_sha256");
    expect(sql).not.toContain("password_plaintext");
  });

  it("adds tenant-scoped checkpoints, leases, quarantine, and replay-safe exact movements", async () => {
    const sql = await readFile(fileURLToPath(sprintTwoMigrationUrl), "utf8");

    expect(sql.match(/FORCE ROW LEVEL SECURITY/gu)).toHaveLength(5);
    expect(sql).toContain("CREATE TABLE orbit.ingestion_runs");
    expect(sql).toContain("CREATE TABLE orbit.ingestion_run_leases");
    expect(sql).toContain("CREATE TABLE orbit.ingestion_checkpoints");
    expect(sql).toContain("CREATE TABLE orbit.ingestion_quarantine");
    expect(sql).toContain("CREATE TABLE orbit.canonical_movements");
    expect(sql).toContain("UNIQUE (tenant_id, integration_id, chain_id, transaction_hash, movement_discriminator)");
    expect(sql).toContain("quantity_atomic text");
    expect(sql).toContain("canonical_movements_append_only");
  });

  it("defines a non-bypass least-privilege application role", async () => {
    const sql = await readFile(fileURLToPath(applicationRoleMigrationUrl), "utf8");

    expect(sql).toContain("CREATE ROLE orbitos_app");
    expect(sql).toContain("NOBYPASSRLS");
    expect(sql).toContain("REVOKE ALL ON ALL TABLES IN SCHEMA orbit FROM PUBLIC");
    expect(sql).toContain("GRANT SELECT, INSERT ON");
    expect(sql).not.toMatch(/(?:^|\s)SUPERUSER(?:\s|$)/u);
    expect(sql).not.toContain("GRANT ALL");
  });

  it("pins function search paths and indexes every uncovered foreign key", async () => {
    const sql = await readFile(fileURLToPath(supabaseHardeningMigrationUrl), "utf8");

    expect(sql.match(/SET search_path = pg_catalog/gu)).toHaveLength(4);
    expect(sql.match(/CREATE INDEX/gu)).toHaveLength(7);
    expect(sql).toContain("ON orbit.auth_sessions (tenant_id, actor_id)");
    expect(sql).toContain("ON orbit.ingestion_deliveries (tenant_id, evidence_id)");
  });

  it("adds tenant-scoped immutable verification policy and decision history", async () => {
    const sql = await readFile(fileURLToPath(sprintThreeVerificationMigrationUrl), "utf8");

    expect(sql.match(/FORCE ROW LEVEL SECURITY/gu)).toHaveLength(2);
    expect(sql).toContain("CREATE TABLE orbit.verification_policies");
    expect(sql).toContain("CREATE TABLE orbit.verification_decisions");
    expect(sql).toContain("minimum_independent_providers BETWEEN 2 AND 4");
    expect(sql).toContain("verified decision requires every mandatory policy dimension to pass");
    expect(sql).toContain("verification_decisions_append_only");
    expect(sql).toContain("illegal verification transition from % to %");
    expect(sql).toContain("SET search_path = pg_catalog");
  });

  it("adds exact append-only reconciliation and auditable exception workflow", async () => {
    const sql = await readFile(fileURLToPath(sprintThreeReconciliationMigrationUrl), "utf8");

    expect(sql.match(/FORCE ROW LEVEL SECURITY/gu)).toHaveLength(3);
    expect(sql).toContain("CREATE TABLE orbit.reconciliation_results");
    expect(sql).toContain("CREATE TABLE orbit.operational_exceptions");
    expect(sql).toContain("CREATE TABLE orbit.exception_events");
    expect(sql).toContain("exception source facts are immutable");
    expect(sql).toContain("reconciliation_results_append_only");
    expect(sql).toContain("UNIQUE (tenant_id, stable_key)");
    expect(sql).toContain("SET search_path = pg_catalog");
  });

  it("adds the RLS-protected reseller hierarchy, domains, roles, and two-sided billing", async () => {
    const sql = await readFile(fileURLToPath(resellerControlPlaneMigrationUrl), "utf8");

    expect(sql.match(/FORCE ROW LEVEL SECURITY/gu)).toHaveLength(7);
    expect(sql).toContain("CREATE FUNCTION orbit.current_platform_access()");
    expect(sql).toContain("CREATE TABLE orbit.customers");
    expect(sql).toContain("CREATE TABLE orbit.tenant_domains");
    expect(sql).toContain("CREATE TABLE orbit.custom_roles");
    expect(sql).toContain("CREATE TABLE orbit.custom_role_permissions");
    expect(sql).toContain("CREATE TABLE orbit.custom_role_assignments");
    expect(sql).toContain("CREATE TABLE orbit.billing_subscriptions");
    expect(sql).toContain("CREATE TABLE orbit.billing_invoices");
    expect(sql).toContain("amount_minor bigint");
    expect(sql).toContain("amount_due_minor bigint");
    expect(sql).toContain("OR orbit.current_platform_access()");
  });

  it("adds RLS-protected connection references and immutable CSV import metadata", async () => {
    const sql = await readFile(fileURLToPath(dataConnectionsMigrationUrl), "utf8");

    expect(sql.match(/FORCE ROW LEVEL SECURITY/gu)).toHaveLength(2);
    expect(sql).toContain("CREATE TABLE orbit.data_connections");
    expect(sql).toContain("CREATE TABLE orbit.csv_imports");
    expect(sql).toContain("public_configuration jsonb");
    expect(sql).toContain("secret_reference text");
    expect(sql).toContain("UNIQUE (tenant_id, payload_sha256)");
    expect(sql).toContain("csv_imports_append_only");
    expect(sql).toContain("GRANT SELECT, INSERT ON orbit.csv_imports TO orbitos_app");
  });

  it("adds customer-scoped foreign keys and indexes to integrations and controls", async () => {
    const sql = await readFile(fileURLToPath(customerIntegrationsMigrationUrl), "utf8");

    expect(sql).toContain("ALTER TABLE orbit.customers\n  ADD COLUMN email text;");
    expect(sql).toContain("ALTER TABLE orbit.actors\n  ADD COLUMN customer_id uuid");
    expect(sql).toContain("ALTER TABLE orbit.data_connections\n  ADD COLUMN customer_id uuid");
    expect(sql).toContain("ALTER TABLE orbit.integrations\n  ADD COLUMN customer_id uuid");
    expect(sql).toContain("ALTER TABLE orbit.csv_imports\n  ADD COLUMN customer_id uuid");
    expect(sql).toContain("ALTER TABLE orbit.reconciliation_results\n  ADD COLUMN customer_id uuid");
    expect(sql).toContain("CREATE INDEX integrations_customer_idx");
  });
});

import { randomUUID } from "node:crypto";

import { hashPassword } from "@orbitos/authz";
import { signInRequestSchema } from "@orbitos/canonical-model";
import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString.length === 0) {
  throw new Error("DATABASE_URL is required");
}

const credentials = signInRequestSchema.parse({
  email: process.env.ORBITOS_BOOTSTRAP_EMAIL ?? "orbitos@devlogix.com.pk",
  password: process.env.ORBITOS_BOOTSTRAP_PASSWORD,
});
const tenantDisplayName =
  process.env.ORBITOS_BOOTSTRAP_TENANT_NAME ?? "Devlogix OrbitOS Staging";
const passwordHash = await hashPassword(credentials.password);
const client = new Client({ connectionString });
await client.connect();

try {
  await client.query("begin");
  const existing = await client.query<{ actor_id: string; tenant_id: string }>(
    "select tenant_id, actor_id from orbit.auth_credentials where email = $1",
    [credentials.email],
  );
  const tenantId = existing.rows[0]?.tenant_id ?? randomUUID();
  const actorId = existing.rows[0]?.actor_id ?? randomUUID();

  await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
  await client.query(
    `insert into orbit.tenants (id, display_name)
     values ($1, $2)
     on conflict (id) do update set display_name = excluded.display_name`,
    [tenantId, tenantDisplayName],
  );
  await client.query(
    `insert into orbit.actors (tenant_id, id, external_subject)
     values ($1, $2, $3)
     on conflict (tenant_id, id) do update
       set external_subject = excluded.external_subject`,
    [tenantId, actorId, `password:${credentials.email}`],
  );
  await client.query(
    `insert into orbit.memberships (tenant_id, actor_id, role)
     values ($1, $2, 'administrator')
     on conflict do nothing`,
    [tenantId, actorId],
  );
  await client.query(
    `insert into orbit.auth_credentials (
       tenant_id, actor_id, email, password_hash, enabled
     ) values ($1, $2, $3, $4, true)
     on conflict (tenant_id, actor_id) do update set
       email = excluded.email,
       password_hash = excluded.password_hash,
       enabled = true,
       failed_authentication_count = 0,
       locked_until = null,
       password_changed_at = statement_timestamp()`,
    [tenantId, actorId, credentials.email, passwordHash],
  );
  await client.query(
    `insert into orbit.verification_policies (
       tenant_id, id, version, minimum_independent_providers,
       finality_mode, require_inclusion, require_execution, created_at
     ) values (
       $1, '00000000-0000-4000-8000-000000000301', 'bsc-v1', 2,
       'finalized_tag', true, true, statement_timestamp()
     )
     on conflict (tenant_id, version) do nothing`,
    [tenantId],
  );
  await client.query("commit");
  process.stdout.write(`staging administrator ready: ${credentials.email}\n`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}

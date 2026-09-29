import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString.length === 0) {
  throw new Error("DATABASE_URL is required");
}

const client = new Client({ connectionString });
await client.connect();

try {
  await client.query("select pg_advisory_lock(1337246987)");
  await client.query("create schema if not exists orbit");
  await client.query(`
    create table if not exists orbit.schema_migrations (
      name text primary key,
      sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
      applied_at timestamptz not null default statement_timestamp()
    )
  `);

  const migrationsUrl = new URL("../migrations/", import.meta.url);
  const migrationNames = (await readdir(migrationsUrl))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort();

  for (const name of migrationNames) {
    const source = await readFile(new URL(name, migrationsUrl), "utf8");
    const sha256 = createHash("sha256").update(source).digest("hex");
    const applied = await client.query<{ sha256: string }>(
      "select sha256 from orbit.schema_migrations where name = $1",
      [name],
    );
    const existing = applied.rows[0];
    if (existing !== undefined) {
      if (existing.sha256 !== sha256) {
        throw new Error(`Applied migration ${name} does not match the repository digest`);
      }
      process.stdout.write(`already applied ${name}\n`);
      continue;
    }

    await client.query("begin");
    try {
      await client.query(source);
      await client.query(
        "insert into orbit.schema_migrations (name, sha256) values ($1, $2)",
        [name, sha256],
      );
      await client.query("commit");
      process.stdout.write(`applied ${name}\n`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.query("select pg_advisory_unlock(1337246987)").catch(() => undefined);
  await client.end();
}

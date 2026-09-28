import {
  Kysely,
  PostgresDialect,
  sql,
  type Transaction,
} from "kysely";
import { Pool } from "pg";

export interface DatabaseSchema {
  readonly [tableName: string]: Record<string, unknown>;
}

export function createDatabase(connectionString: string): Kysely<DatabaseSchema> {
  return new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString }),
    }),
  });
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

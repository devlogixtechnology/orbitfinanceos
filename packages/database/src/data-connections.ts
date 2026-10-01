import {
  csvImportSchema,
  dataConnectionSchema,
  type ConfigureDataConnectionRequest,
  type CsvImport,
  type DataConnection,
} from "@orbitos/canonical-model";
import { sql, type Kysely } from "kysely";
import { randomUUID } from "node:crypto";

import { withTenantTransaction, type DatabaseSchema } from "./index.js";

export interface RecordCsvImportCommand {
  readonly byteLength: string;
  readonly customerId?: string;
  readonly fileName: string;
  readonly importId: string;
  readonly objectUri: string;
  readonly rowCount: string;
  readonly sha256: string;
  readonly tenantId: string;
}

export interface DataConnectionRepository {
  configure(tenantId: string, input: ConfigureDataConnectionRequest): Promise<DataConnection>;
  deleteCsvImport(tenantId: string, importId: string): Promise<boolean>;
  list(tenantId: string, customerId?: string): Promise<readonly DataConnection[]>;
  listCsvImports(tenantId: string, customerId?: string): Promise<readonly CsvImport[]>;
  recordCsvImport(command: RecordCsvImportCommand): Promise<CsvImport>;
}

function mapConnection(row: Record<string, unknown>): DataConnection {
  return dataConnectionSchema.parse({
    connectionId: row.id,
    createdAt: (row.created_at as Date).toISOString(),
    ...(typeof row.customer_id === "string" ? { customerId: row.customer_id } : {}),
    displayName: row.display_name,
    hasSecretReference: typeof row.secret_reference === "string" && row.secret_reference.length > 0,
    provider: row.provider,
    publicConfiguration: row.public_configuration,
    schemaVersion: "1",
    status: row.status,
    tenantId: row.tenant_id,
  });
}

function mapCsvImport(row: Record<string, unknown>): CsvImport {
  return csvImportSchema.parse({
    byteLength: String(row.byte_length),
    createdAt: (row.created_at as Date).toISOString(),
    ...(typeof row.customer_id === "string" ? { customerId: row.customer_id } : {}),
    fileName: row.file_name,
    importId: row.id,
    objectUri: row.object_uri,
    rowCount: String(row.row_count),
    schemaVersion: "1",
    sha256: row.payload_sha256,
    status: row.status,
    tenantId: row.tenant_id,
  });
}

export class PostgresDataConnectionRepository implements DataConnectionRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async configure(tenantId: string, input: ConfigureDataConnectionRequest): Promise<DataConnection> {
    return withTenantTransaction(this.database, tenantId, async (transaction) => {
      const result = await sql<Record<string, unknown>>`
        insert into orbit.data_connections (
          tenant_id, id, customer_id, provider, display_name, public_configuration, secret_reference
        ) values (
          ${tenantId}::uuid, ${randomUUID()}::uuid, ${input.customerId ?? null}::uuid, ${input.provider}, ${input.displayName},
          ${JSON.stringify(input.publicConfiguration)}::jsonb, ${input.secretReference}
        )
        on conflict (tenant_id, provider, display_name) do update
          set public_configuration = excluded.public_configuration,
              secret_reference = excluded.secret_reference,
              customer_id = coalesce(excluded.customer_id, orbit.data_connections.customer_id),
              status = 'configured'
        returning tenant_id, id, customer_id, provider, display_name, status,
          public_configuration, secret_reference, created_at
      `.execute(transaction);
      const row = result.rows[0];
      if (row === undefined) throw new Error("The connection configuration was not returned.");
      return mapConnection(row);
    });
  }

  async list(tenantId: string, customerId?: string): Promise<readonly DataConnection[]> {
    return withTenantTransaction(this.database, tenantId, async (transaction) => {
      const result = customerId === undefined
        ? await sql<Record<string, unknown>>`
            select tenant_id, id, customer_id, provider, display_name, status,
              public_configuration, secret_reference, created_at
            from orbit.data_connections
            order by created_at desc, id
          `.execute(transaction)
        : await sql<Record<string, unknown>>`
            select tenant_id, id, customer_id, provider, display_name, status,
              public_configuration, secret_reference, created_at
            from orbit.data_connections
            where customer_id = ${customerId}::uuid
            order by created_at desc, id
          `.execute(transaction);
      return result.rows.map(mapConnection);
    });
  }

  async deleteCsvImport(tenantId: string, importId: string): Promise<boolean> {
    return withTenantTransaction(this.database, tenantId, async (transaction) => {
      const result = await sql`
        delete from orbit.csv_imports
        where tenant_id = ${tenantId}::uuid and id = ${importId}::uuid
      `.execute(transaction);
      return (result.numAffectedRows ?? 0n) > 0n;
    });
  }

  async listCsvImports(tenantId: string, customerId?: string): Promise<readonly CsvImport[]> {
    return withTenantTransaction(this.database, tenantId, async (transaction) => {
      const result = customerId === undefined
        ? await sql<Record<string, unknown>>`
            select tenant_id, id, customer_id, file_name, object_uri, payload_sha256,
              byte_length, row_count, status, created_at
            from orbit.csv_imports
            order by created_at desc, id desc
            limit 50
          `.execute(transaction)
        : await sql<Record<string, unknown>>`
            select tenant_id, id, customer_id, file_name, object_uri, payload_sha256,
              byte_length, row_count, status, created_at
            from orbit.csv_imports
            where customer_id = ${customerId}::uuid or customer_id is null
            order by created_at desc, id desc
            limit 50
          `.execute(transaction);
      return result.rows.map(mapCsvImport);
    });
  }

  async recordCsvImport(command: RecordCsvImportCommand): Promise<CsvImport> {
    return withTenantTransaction(this.database, command.tenantId, async (transaction) => {
      const result = await sql<Record<string, unknown>>`
        insert into orbit.csv_imports (
          tenant_id, id, customer_id, file_name, object_uri, payload_sha256, byte_length, row_count
        ) values (
          ${command.tenantId}::uuid, ${command.importId}::uuid, ${command.customerId ?? null}::uuid, ${command.fileName},
          ${command.objectUri}, ${command.sha256}, ${command.byteLength}::bigint,
          ${command.rowCount}::bigint
        )
        on conflict (tenant_id, payload_sha256) do nothing
        returning tenant_id, id, customer_id, file_name, object_uri, payload_sha256,
          byte_length, row_count, status, created_at
      `.execute(transaction);
      const inserted = result.rows[0];
      if (inserted !== undefined) return mapCsvImport(inserted);
      const existing = await sql<Record<string, unknown>>`
        select tenant_id, id, customer_id, file_name, object_uri, payload_sha256,
          byte_length, row_count, status, created_at
        from orbit.csv_imports
        where payload_sha256 = ${command.sha256}
      `.execute(transaction);
      const row = existing.rows[0];
      if (row === undefined) throw new Error("The CSV import record was not returned.");
      return mapCsvImport(row);
    });
  }
}

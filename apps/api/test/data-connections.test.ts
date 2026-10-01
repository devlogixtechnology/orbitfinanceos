import { permissionsForRoles, type SessionAuthenticator } from "@orbitos/authz";
import type { CsvImport, DataConnection, SessionContext } from "@orbitos/canonical-model";
import type { DataConnectionRepository } from "@orbitos/database";
import type { DurableEvidenceStore } from "@orbitos/evidence-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildServer } from "../src/server.js";

const tenantId = "22222222-2222-4222-8222-222222222222";
const connection: DataConnection = {
  connectionId: "33333333-3333-4333-8333-333333333333",
  createdAt: "2026-09-30T00:00:00.000Z",
  displayName: "QuickBooks Online",
  hasSecretReference: true,
  provider: "quickbooks",
  publicConfiguration: { companyId: "realm-123", environment: "sandbox" },
  schemaVersion: "1",
  status: "configured",
  tenantId,
};
const csvImport: CsvImport = {
  byteLength: "24",
  createdAt: "2026-09-30T00:00:00.000Z",
  fileName: "transactions.csv",
  importId: "44444444-4444-4444-8444-444444444444",
  objectUri: `evidence://${tenantId}/digest`,
  rowCount: "1",
  schemaVersion: "1",
  sha256: "a".repeat(64),
  status: "preserved",
  tenantId,
};

const session: SessionContext = {
  actor: { actorId: "11111111-1111-4111-8111-111111111111", subject: "password:admin@example.com" },
  authenticatedAt: "2026-09-30T00:00:00.000Z",
  expiresAt: "2026-09-30T08:00:00.000Z",
  permissions: [...permissionsForRoles(["tenant_admin"])],
  roles: ["tenant_admin"],
  schemaVersion: "1",
  tenant: { displayName: "Example Company", tenantId },
};

const configure = vi.fn<DataConnectionRepository["configure"]>(() => Promise.resolve(connection));
const recordCsvImport = vi.fn<DataConnectionRepository["recordCsvImport"]>(() => Promise.resolve(csvImport));
const repository: DataConnectionRepository = {
  configure,
  deleteCsvImport: vi.fn<DataConnectionRepository["deleteCsvImport"]>(() => Promise.resolve(true)),
  list: () => Promise.resolve([connection]),
  listCsvImports: () => Promise.resolve([csvImport]),
  recordCsvImport,
};
const evidenceStore: DurableEvidenceStore = {
  append: () => Promise.resolve({
    attributes: { payloadFormat: "csv" },
    byteLength: "24",
    evidenceId: csvImport.importId,
    independenceGroup: "customer-upload",
    integrationId: csvImport.importId,
    objectUri: csvImport.objectUri,
    observedAt: csvImport.createdAt,
    provider: "csv-upload",
    sha256: csvImport.sha256,
    tenantId,
  }),
  checkReadiness: () => Promise.resolve(),
  readByDigest: () => Promise.resolve(new Uint8Array()),
  readMetadata: () => Promise.reject(new Error("Not used")),
  verifyIntegrity: () => Promise.resolve(true),
};

const servers = new Set<ReturnType<typeof buildServer>>();

afterEach(async () => {
  configure.mockClear();
  recordCsvImport.mockClear();
  await Promise.all([...servers].map(async (server) => server.close()));
  servers.clear();
});

describe("data connection and CSV APIs", () => {
  it("stores only a provider vault reference and never echoes it", async () => {
    const authenticator: SessionAuthenticator = { authenticate: () => Promise.resolve(session) };
    const server = buildServer({ authenticator, dataConnectionRepository: repository });
    servers.add(server);

    const response = await server.inject({
      headers: { authorization: "Bearer valid" },
      method: "POST",
      payload: {
        displayName: "QuickBooks Online",
        provider: "quickbooks",
        publicConfiguration: { companyId: "realm-123", environment: "sandbox" },
        schemaVersion: "1",
        secretReference: "vault://quickbooks/oauth-bundle",
      },
      url: "/v1/data-connections",
    });

    expect(response.statusCode).toBe(201);
    expect(response.body).not.toContain("vault://quickbooks/oauth-bundle");
    expect(response.json()).toEqual(connection);
    expect(configure.mock.calls[0]?.[1].secretReference).toBe("vault://quickbooks/oauth-bundle");
  });

  it("validates and preserves CSV bytes before recording import metadata", async () => {
    const authenticator: SessionAuthenticator = { authenticate: () => Promise.resolve(session) };
    const server = buildServer({ authenticator, dataConnectionRepository: repository, evidenceStore });
    servers.add(server);

    const response = await server.inject({
      headers: { authorization: "Bearer valid" },
      method: "POST",
      payload: {
        contentBase64: Buffer.from("date,amount\n2026-09-30,42\n").toString("base64"),
        fileName: "transactions.csv",
        schemaVersion: "1",
      },
      url: "/v1/csv-imports",
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(csvImport);
    expect(recordCsvImport).toHaveBeenCalledOnce();
    expect(recordCsvImport.mock.calls[0]?.[0]).toMatchObject({ fileName: "transactions.csv", rowCount: "1", tenantId });
  });
});

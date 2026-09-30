import { PasswordSessionService } from "@orbitos/authz";
import type { Integration } from "@orbitos/canonical-model";
import {
  BscIngestionService,
  BscJsonRpcClient,
  BscVerificationService,
  BscVerifiedIngestionService,
} from "@orbitos/connector-bsc";
import {
  PostgresEvidenceCatalog,
  PostgresCustomAuthRepository,
  PostgresIngestionRepository,
  PostgresIntegrationRepository,
  PostgresReconciliationQueryService,
  PostgresVerificationDecisionStore,
  PostgresVerificationPolicyStore,
  checkDatabaseReadiness,
  createDatabase,
} from "@orbitos/database";
import {
  FilesystemEvidenceStore,
  SupabaseStorageEvidenceStore,
  type DurableEvidenceStore,
} from "@orbitos/evidence-core";
import { ExactReconciliationRunner } from "@orbitos/reconciliation-core";

import { buildServer } from "./server.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "127.0.0.1";
const maximumIngestionBlockSpan = BigInt(process.env.ORBITOS_MAX_INGESTION_BLOCKS ?? "2000");
if (maximumIngestionBlockSpan <= 0n) {
  throw new Error("ORBITOS_MAX_INGESTION_BLOCKS must be a positive integer");
}
const databaseUrl = process.env.DATABASE_URL;
const database =
  databaseUrl === undefined ? undefined : createDatabase(databaseUrl);
const sessionService =
  database === undefined
    ? undefined
    : new PasswordSessionService(new PostgresCustomAuthRepository(database));
const integrationRepository =
  database === undefined ? undefined : new PostgresIntegrationRepository(database);
const providerEndpoints: Readonly<Record<string, { chainId: "56" | "97"; url: string }>> = {
  "allnodes-publicnode-testnet": { chainId: "97", url: "https://bsc-testnet-rpc.publicnode.com" },
  "publicnode-mainnet": { chainId: "56", url: "https://bsc-rpc.publicnode.com" },
  "sentio-mainnet": { chainId: "56", url: "https://rpc.sentio.xyz/bsc" },
  "sentio-testnet": { chainId: "97", url: "https://rpc.sentio.xyz/bsc-testnet" },
};
const reconciliationService =
  database === undefined ? undefined : new PostgresReconciliationQueryService(database);
const verificationStore =
  database === undefined ? undefined : new PostgresVerificationDecisionStore(database);
const verificationPolicyStore =
  database === undefined ? undefined : new PostgresVerificationPolicyStore(database);
function createEvidenceStore(): DurableEvidenceStore {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  if ((supabaseUrl === undefined) !== (supabaseSecretKey === undefined)) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be configured together");
  }
  if (supabaseUrl !== undefined && supabaseSecretKey !== undefined) {
    return new SupabaseStorageEvidenceStore({
      bucket: process.env.SUPABASE_EVIDENCE_BUCKET ?? "orbitos-evidence-staging",
      secretKey: supabaseSecretKey,
      supabaseUrl,
    });
  }
  return new FilesystemEvidenceStore(
    process.env.ORBITOS_EVIDENCE_ROOT ?? ".orbitos/evidence",
  );
}

const evidenceStore = createEvidenceStore();
const evidenceCatalog = database === undefined ? undefined : new PostgresEvidenceCatalog(database);
const createBscClient = (
  integration: Integration,
  group: Integration["providerGroups"][number],
) => {
  if (evidenceCatalog === undefined) throw new Error("Evidence catalog is unavailable");
  const endpoint = providerEndpoints[group.groupId];
  if (endpoint === undefined) throw new Error("The configured provider group is not allowlisted");
  return new BscJsonRpcClient({
    endpoint: endpoint.url,
    evidenceSink: {
      append: async (raw) => {
        const stored = await evidenceStore.append({
          attributes: { method: raw.method, requestFingerprint: raw.requestFingerprint },
          evidenceId: raw.evidenceId,
          independenceGroup: raw.independenceGroup,
          integrationId: raw.integrationId,
          observedAt: raw.observedAt,
          provider: raw.provider,
          rawBytes: raw.rawBytes,
          tenantId: raw.tenantId,
        });
        await evidenceCatalog.record(stored);
      },
    },
    independenceGroup: group.independenceGroup,
    integrationId: integration.integrationId,
    provider: group.groupId,
    tenantId: integration.tenantId,
  });
};
const baseIngestionService =
  database === undefined || integrationRepository === undefined
    ? undefined
    : new BscIngestionService(
        integrationRepository,
        new PostgresIngestionRepository(database),
        createBscClient,
      );
const verificationService =
  verificationStore === undefined || reconciliationService === undefined
    ? undefined
    : new BscVerificationService(createBscClient, verificationStore, {
        onConflict: (decision) => reconciliationService.openVerificationConflict(decision),
      });
const ingestionService =
  baseIngestionService === undefined ||
  integrationRepository === undefined ||
  verificationPolicyStore === undefined ||
  verificationService === undefined ||
  verificationStore === undefined
    ? undefined
    : new BscVerifiedIngestionService(
        baseIngestionService,
        integrationRepository,
        verificationPolicyStore,
        verificationService,
        verificationStore,
      );
const reconciliationRunner =
  ingestionService === undefined || verificationStore === undefined || reconciliationService === undefined
    ? undefined
    : new ExactReconciliationRunner(ingestionService, verificationStore, reconciliationService);

async function checkProviderReadiness(): Promise<"degraded" | "ok"> {
  const results = await Promise.all(
    Object.values(providerEndpoints).map(async (provider) => {
      try {
        const response = await fetch(provider.url, {
          body: JSON.stringify({ id: "orbitos-readiness", jsonrpc: "2.0", method: "eth_chainId", params: [] }),
          headers: { "content-type": "application/json" },
          method: "POST",
          signal: AbortSignal.timeout(3_000),
        });
        if (!response.ok) return { chainId: provider.chainId, ok: false };
        const payload = await response.json() as { result?: unknown };
        const expected = provider.chainId === "56" ? "0x38" : "0x61";
        return { chainId: provider.chainId, ok: payload.result === expected };
      } catch {
        return { chainId: provider.chainId, ok: false };
      }
    }),
  );
  for (const chainId of ["56", "97"] as const) {
    if (!results.some((result) => result.chainId === chainId && result.ok)) {
      throw new Error("No configured provider is available for a required network");
    }
  }
  return results.every((result) => result.ok) ? "ok" : "degraded";
}
const server =
  database === undefined ||
  sessionService === undefined ||
  integrationRepository === undefined ||
  ingestionService === undefined ||
  reconciliationService === undefined ||
  reconciliationRunner === undefined ||
  verificationStore === undefined
    ? buildServer()
    : buildServer({
        authenticator: sessionService,
        ingestionService,
        integrationRepository,
        maximumIngestionBlockSpan,
        reconciliationService,
        reconciliationRunner,
        readinessChecks: [
          { check: async () => { await checkDatabaseReadiness(database); return "ok"; }, name: "database" },
          { check: async () => { await evidenceStore.checkReadiness(); return "ok"; }, name: "object_store" },
          { check: checkProviderReadiness, name: "providers" },
        ],
        sessionService,
        verificationStore,
      });

if (database !== undefined) {
  server.addHook("onClose", async () => database.destroy());
}

try {
  await server.listen({ host, port });
} catch (error) {
  server.log.error(error);
  process.exitCode = 1;
}

"use server";

import {
  createIngestionRunRequestSchema,
  createIntegrationRequestSchema,
  configureDataConnectionRequestSchema,
  csvImportRequestSchema,
  updateIntegrationRequestSchema,
  uuidSchema,
} from "@orbitos/canonical-model";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Buffer } from "node:buffer";

import { fetchAuthorizedApi } from "../../../lib/session";

const providerGroups = {
  "56": [
    { endpointReference: "https://rpc.sentio.xyz/bsc", groupId: "sentio-mainnet", independenceGroup: "sentio" },
    { endpointReference: "https://bsc-rpc.publicnode.com", groupId: "publicnode-mainnet", independenceGroup: "publicnode" },
  ],
  "97": [
    { endpointReference: "https://bsc-testnet-rpc.publicnode.com", groupId: "allnodes-publicnode-testnet", independenceGroup: "allnodes-publicnode" },
    { endpointReference: "https://rpc.sentio.xyz/bsc-testnet", groupId: "sentio-testnet", independenceGroup: "sentio" },
  ],
} as const;

function optionalString(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export async function configureDataConnection(formData: FormData): Promise<never> {
  const provider = formData.get("provider");
  const customerId = optionalString(formData.get("customerId"));
  const publicConfiguration = provider === "quickbooks"
    ? {
        companyId: formData.get("companyId"),
        environment: formData.get("environment"),
      }
    : {
        baseUrl: formData.get("baseUrl"),
        workspaceId: formData.get("workspaceId"),
      };
  const input = configureDataConnectionRequestSchema.safeParse({
    ...(customerId ? { customerId } : {}),
    displayName: formData.get("displayName"),
    provider,
    publicConfiguration,
    schemaVersion: "1",
    secretReference: formData.get("secretReference"),
  });
  if (!input.success) redirect("/app/integrations?error=connection-invalid");
  const response = await fetchAuthorizedApi("/v1/data-connections", {
    body: JSON.stringify(input.data),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (response === null || !response.ok) redirect("/app/integrations?error=connection-unavailable");
  revalidatePath("/app/integrations");
  redirect("/app/integrations?connected=1");
}

export async function uploadCsvImport(formData: FormData): Promise<never> {
  const candidate = formData.get("csvFile");
  if (!(candidate instanceof File) || candidate.size === 0 || candidate.size > 104_857_600) {
    redirect("/app/integrations?error=csv-invalid");
  }
  const customerId = optionalString(formData.get("customerId"));
  const shouldReconcile = formData.get("startReconciliation") === "true";
  const input = csvImportRequestSchema.safeParse({
    contentBase64: Buffer.from(await candidate.arrayBuffer()).toString("base64"),
    ...(customerId ? { customerId } : {}),
    fileName: candidate.name,
    schemaVersion: "1",
  });
  if (!input.success) redirect("/app/integrations?error=csv-invalid");
  const response = await fetchAuthorizedApi("/v1/csv-imports", {
    body: JSON.stringify(input.data),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (response === null || !response.ok) {
    if (response) {
      try {
        const errorJson = (await response.json()) as { code?: string };
        if (errorJson?.code === "EMPTY_CSV") {
          redirect("/app/integrations?error=csv-empty");
        }
      } catch (err) {
        if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
      }
    }
    redirect("/app/integrations?error=csv-unavailable");
  }
  
  let importIdToReconcile: string | undefined;
  if (shouldReconcile) {
    try {
      const importedData = (await response.json()) as { importId: string };
      importIdToReconcile = importedData?.importId;
    } catch {
      // If reading json fails, fall through
    }
  }

  if (importIdToReconcile) {
    const reconRes = await fetchAuthorizedApi(`/v1/csv-imports/${importIdToReconcile}/reconcile`, {
      body: JSON.stringify({ ...(customerId ? { customerId } : {}) }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (reconRes !== null && !reconRes.ok) {
      try {
        const errData = (await reconRes.json()) as { code?: string };
        if (errData?.code === "EMPTY_CSV") {
          redirect("/app/integrations?error=csv-empty");
        }
      } catch (err) {
        if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
      }
      redirect("/app/integrations?error=reconciliation-failed");
    }
    revalidatePath("/app/reconciliation");
    revalidatePath("/app/integrations");
    redirect("/app/reconciliation?reconciled=1");
  }

  revalidatePath("/app/integrations");
  redirect("/app/integrations?imported=1");
}

export async function configureNetworkScanner(formData: FormData): Promise<never> {
  const customerId = optionalString(formData.get("customerId"));
  const scannerId = formData.get("scannerId")?.toString().trim() ?? "";
  const displayName = formData.get("displayName")?.toString().trim() ?? `Scanner (${scannerId})`;
  const apiUrl = formData.get("apiUrl")?.toString().trim() ?? "";
  const apiKey = formData.get("apiKey")?.toString().trim() ?? "";
  const explorerUrl = formData.get("explorerUrl")?.toString().trim() ?? "";

  const input = configureDataConnectionRequestSchema.safeParse({
    ...(customerId ? { customerId } : {}),
    displayName,
    provider: "network_scanner",
    publicConfiguration: {
      apiUrl,
      explorerUrl,
      scannerId,
    },
    schemaVersion: "1",
    secretReference: apiKey || "none",
  });
  if (!input.success) redirect("/app/integrations?error=connection-invalid");
  const response = await fetchAuthorizedApi("/v1/data-connections", {
    body: JSON.stringify(input.data),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (response === null || !response.ok) redirect("/app/integrations?error=connection-unavailable");
  revalidatePath("/app/integrations");
  redirect("/app/integrations?connected=scanner");
}

export async function configureCompanyWallet(formData: FormData): Promise<never> {
  const customerId = optionalString(formData.get("customerId"));
  const label = formData.get("label")?.toString().trim() ?? "Company Wallet";
  const address = formData.get("address")?.toString().trim().toLowerCase() ?? "";
  const network = formData.get("network")?.toString().trim() ?? "ethereum";

  if (!address.startsWith("0x") || address.length < 10) {
    redirect("/app/integrations?error=wallet-invalid");
  }

  const input = configureDataConnectionRequestSchema.safeParse({
    ...(customerId ? { customerId } : {}),
    displayName: `${label} (${address.slice(0, 6)}...${address.slice(-4)})`,
    provider: "company_wallet",
    publicConfiguration: {
      address,
      label,
      network,
    },
    schemaVersion: "1",
    secretReference: "internal-company-wallet",
  });
  if (!input.success) redirect("/app/integrations?error=connection-invalid");
  const response = await fetchAuthorizedApi("/v1/data-connections", {
    body: JSON.stringify(input.data),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (response === null || !response.ok) redirect("/app/integrations?error=connection-unavailable");
  revalidatePath("/app/integrations");
  redirect("/app/integrations?connected=wallet");
}

export async function reconcileCsvImport(formData: FormData): Promise<never> {
  const importId = uuidSchema.safeParse(formData.get("importId"));
  const customerId = optionalString(formData.get("customerId"));
  if (!importId.success) redirect("/app/integrations?error=csv-invalid");
  const response = await fetchAuthorizedApi(`/v1/csv-imports/${importId.data}/reconcile`, {
    body: JSON.stringify({ ...(customerId ? { customerId } : {}) }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (response === null || !response.ok) redirect("/app/integrations?error=reconciliation-failed");
  revalidatePath("/app/reconciliation");
  revalidatePath("/app/integrations");
  redirect("/app/reconciliation?reconciled=1");
}

export async function createIntegration(formData: FormData): Promise<never> {
  const rawChainId = formData.get("chainId");
  const chainId = rawChainId === "56" || rawChainId === "97" ? rawChainId : "";
  const customerId = optionalString(formData.get("customerId"));
  const configuration = createIntegrationRequestSchema.safeParse({
    ...(customerId ? { customerId } : {}),
    finalityPolicyVersion: "bsc-confirmations-v1",
    network: { chainId, family: "evm" },
    provider: "bsc-json-rpc",
    providerGroups: chainId === "" ? [] : providerGroups[chainId],
    schemaVersion: "1",
    startingBlock: formData.get("startingBlock"),
    tokenContracts: [formData.get("tokenContract")],
    walletAddresses: [formData.get("walletAddress")],
  });
  if (!configuration.success) {
    redirect("/app/integrations?error=invalid");
  }

  const response = await fetchAuthorizedApi("/v1/integrations", {
    body: JSON.stringify(configuration.data),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (response === null || !response.ok) {
    redirect("/app/integrations?error=unavailable");
  }

  revalidatePath("/app/integrations");
  redirect("/app/integrations?created=1");
}

export async function setIntegrationEnabled(formData: FormData): Promise<never> {
  const integrationId = uuidSchema.safeParse(formData.get("integrationId"));
  const enabled = formData.get("enabled") === "true";
  const changes = updateIntegrationRequestSchema.safeParse({ enabled });
  if (!integrationId.success || !changes.success) redirect("/app/integrations?error=invalid");
  const response = await fetchAuthorizedApi(`/v1/integrations/${integrationId.data}`, {
    body: JSON.stringify(changes.data),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
  if (response === null || !response.ok) redirect("/app/integrations?error=unavailable");
  revalidatePath("/app/integrations");
  redirect("/app/integrations?updated=1");
}

export async function updateIntegrationConfiguration(formData: FormData): Promise<never> {
  const integrationId = uuidSchema.safeParse(formData.get("integrationId"));
  const changes = updateIntegrationRequestSchema.safeParse({
    startingBlock: formData.get("startingBlock"),
    tokenContracts: [formData.get("tokenContract")],
    walletAddresses: [formData.get("walletAddress")],
  });
  if (!integrationId.success || !changes.success) redirect("/app/integrations?error=invalid");
  const response = await fetchAuthorizedApi(`/v1/integrations/${integrationId.data}`, {
    body: JSON.stringify(changes.data),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
  if (response === null || !response.ok) redirect("/app/integrations?error=unavailable");
  revalidatePath("/app/integrations");
  redirect("/app/integrations?updated=1");
}

export async function startIngestion(formData: FormData): Promise<never> {
  const integrationId = uuidSchema.safeParse(formData.get("integrationId"));
  const input = createIngestionRunRequestSchema.safeParse({
    endBlock: formData.get("endBlock"),
    schemaVersion: "1",
  });
  if (!integrationId.success || !input.success) redirect("/app/integrations?error=invalid");
  const response = await fetchAuthorizedApi(`/v1/integrations/${integrationId.data}/runs`, {
    body: JSON.stringify(input.data),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (response === null || !response.ok) redirect("/app/integrations?error=run");
  revalidatePath("/app/integrations");
  revalidatePath("/app/movements");
  redirect("/app/integrations?run=1");
}

export async function controlIngestionRun(formData: FormData): Promise<never> {
  const runId = uuidSchema.safeParse(formData.get("runId"));
  const rawAction = formData.get("runAction");
  const action = rawAction === "pause" || rawAction === "resume" || rawAction === "stop"
    ? rawAction
    : undefined;
  if (!runId.success || action === undefined) redirect("/app/integrations?error=invalid");
  const response = await fetchAuthorizedApi(`/v1/ingestion-runs/${runId.data}/${action}`, { method: "POST" });
  if (response === null || !response.ok) redirect("/app/integrations?error=run");
  revalidatePath("/app/integrations");
  redirect("/app/integrations?updated=1");
}

"use server";

import { uuidSchema } from "@orbitos/canonical-model";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { fetchAuthorizedApi } from "../../../lib/session";

function optionalString(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export async function runReconciliation(formData: FormData): Promise<void> {
  const observed = String(formData.get("observedClosingQuantityAtomic") ?? "").trim();
  const customerId = optionalString(formData.get("customerId"));
  await fetchAuthorizedApi("/v1/reconciliations", {
    body: JSON.stringify({
      assetId: String(formData.get("assetId") ?? ""),
      ...(customerId ? { customerId } : {}),
      cutoff: String(formData.get("cutoff") ?? ""),
      ...(observed.length === 0 ? {} : { observedClosingQuantityAtomic: observed }),
      openingQuantityAtomic: String(formData.get("openingQuantityAtomic") ?? "0"),
      policyVersion: String(formData.get("policyVersion") ?? "bsc-v1"),
      schemaVersion: "1",
      walletAddress: String(formData.get("walletAddress") ?? ""),
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  revalidatePath("/app/reconciliation");
  revalidatePath("/app/exceptions");
}

export async function reconcileFireblocksWallet(formData: FormData): Promise<never> {
  const walletAddress = String(formData.get("walletAddress") ?? "").trim();
  const assetId = String(formData.get("assetId") ?? "").trim();
  const customerId = optionalString(formData.get("customerId"));
  const cutoff = optionalString(formData.get("cutoff"));

  const response = await fetchAuthorizedApi("/v1/data-connections/fireblocks/reconcile", {
    body: JSON.stringify({
      assetId,
      ...(customerId ? { customerId } : {}),
      ...(cutoff ? { cutoff } : {}),
      policyVersion: "bsc-v1",
      schemaVersion: "1",
      walletAddress,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (response === null || !response.ok) {
    redirect("/app/reconciliation?error=fireblocks-reconciliation-failed");
  }
  revalidatePath("/app/reconciliation");
  revalidatePath("/app/exceptions");
  redirect("/app/reconciliation?reconciled=1");
}

export async function reconcileCsvImport(formData: FormData): Promise<never> {
  const importId = uuidSchema.safeParse(formData.get("importId"));
  const customerId = optionalString(formData.get("customerId"));
  if (!importId.success) redirect("/app/reconciliation?error=csv-invalid");
  const response = await fetchAuthorizedApi(`/v1/csv-imports/${importId.data}/reconcile`, {
    body: JSON.stringify({ ...(customerId ? { customerId } : {}) }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (response === null || !response.ok) {
    redirect("/app/reconciliation?error=csv-reconciliation-failed");
  }
  revalidatePath("/app/reconciliation");
  revalidatePath("/app/exceptions");
  redirect("/app/reconciliation?reconciled=1");
}

export async function pushToQuickBooksAction(formData: FormData): Promise<never> {
  const reconciliationId = uuidSchema.safeParse(formData.get("reconciliationId"));
  if (!reconciliationId.success) {
    redirect("/app/reconciliation?error=invalid-reconciliation");
  }

  const response = await fetchAuthorizedApi(`/v1/reconciliations/${reconciliationId.data}/push-to-quickbooks`, {
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (response === null || !response.ok) {
    redirect("/app/reconciliation?error=qb-sync-failed");
  }

  revalidatePath("/app/reconciliation");
  redirect("/app/reconciliation?qbSynced=1");
}


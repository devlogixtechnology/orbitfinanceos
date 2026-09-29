"use server";

import { revalidatePath } from "next/cache";

import { fetchAuthorizedApi } from "../../../lib/session";

export async function runReconciliation(formData: FormData): Promise<void> {
  const observed = String(formData.get("observedClosingQuantityAtomic") ?? "").trim();
  await fetchAuthorizedApi("/v1/reconciliations", {
    body: JSON.stringify({
      assetId: String(formData.get("assetId") ?? ""),
      cutoff: String(formData.get("cutoff") ?? ""),
      ...(observed.length === 0 ? {} : { observedClosingQuantityAtomic: observed }),
      openingQuantityAtomic: String(formData.get("openingQuantityAtomic") ?? ""),
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

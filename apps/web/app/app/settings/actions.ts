"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function saveAutomationSettings(formData: FormData): Promise<never> {
  const autoSync = formData.get("autoSyncQuickbooks") === "true";
  const clearingAccount = String(formData.get("clearingAccount") ?? "12000 - Digital Assets Clearing").trim();
  const varianceAccount = String(formData.get("varianceAccount") ?? "50100 - Realized Variance & Adjustments").trim();

  const cookieStore = await cookies();
  cookieStore.set("orbitos_auto_sync_qb", autoSync ? "true" : "false", { path: "/", maxAge: 60 * 60 * 24 * 365 });
  cookieStore.set("orbitos_qb_clearing_acct", clearingAccount, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  cookieStore.set("orbitos_qb_variance_acct", varianceAccount, { path: "/", maxAge: 60 * 60 * 24 * 365 });

  revalidatePath("/app/settings");
  revalidatePath("/app/reconciliation");
  redirect("/app/settings?saved=1");
}

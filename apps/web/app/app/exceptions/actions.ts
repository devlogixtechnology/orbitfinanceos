"use server";

import { revalidatePath } from "next/cache";

import { fetchAuthorizedApi, loadAuthorizedSession } from "../../../lib/session";

export async function updateExceptionWorkflow(formData: FormData): Promise<void> {
  const exceptionId = String(formData.get("exceptionId") ?? "");
  const state = String(formData.get("state") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const resolutionReasonCode = String(formData.get("resolutionReasonCode") ?? "").trim();
  const assignToMe = formData.get("assignToMe") === "on";
  const session = assignToMe ? await loadAuthorizedSession() : null;
  const payload = {
    ...(assignToMe && session !== null ? { ownerActorId: session.actor.actorId } : {}),
    ...(note.length === 0 ? {} : { note }),
    ...(resolutionReasonCode.length === 0 ? {} : { resolutionReasonCode }),
    ...(state.length === 0 ? {} : { state }),
  };
  await fetchAuthorizedApi(`/v1/exceptions/${encodeURIComponent(exceptionId)}`, {
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
  revalidatePath(`/app/exceptions/${exceptionId}`);
  revalidatePath("/app/exceptions");
}

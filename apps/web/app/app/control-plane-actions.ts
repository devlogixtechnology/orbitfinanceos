"use server";

import {
  createBillingInvoiceRequestSchema,
  createCustomerRequestSchema,
  createDomainRequestSchema,
  createManagedUserRequestSchema,
  createRoleRequestSchema,
  provisionWorkspaceRequestSchema,
  upsertBillingSubscriptionRequestSchema,
} from "@orbitos/canonical-model";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { fetchAuthorizedApi } from "../../lib/session";

function optionalString(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function utcInstant(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

async function postControlPlane(path: string, body: unknown, successPath: string): Promise<never> {
  const response = await fetchAuthorizedApi(path, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (response === null || !response.ok) redirect(`${successPath}?error=1`);
  revalidatePath("/app", "layout");
  redirect(`${successPath}?created=1`);
}

export async function createTenant(formData: FormData): Promise<never> {
  const input = provisionWorkspaceRequestSchema.safeParse({
    administrator: {
      displayName: formData.get("administratorDisplayName"),
      email: formData.get("administratorEmail"),
      temporaryPassword: formData.get("temporaryPassword"),
    },
    displayName: formData.get("displayName"),
    schemaVersion: "1",
    slug: formData.get("slug"),
  });
  if (!input.success) redirect("/app/platform?error=invalid");
  return postControlPlane("/v1/control-plane/workspaces", input.data, "/app/platform");
}

export async function createCustomer(formData: FormData): Promise<never> {
  const input = createCustomerRequestSchema.safeParse({
    displayName: formData.get("displayName"),
    email: optionalString(formData.get("email")),
    externalReference: formData.get("externalReference"),
    schemaVersion: "1",
    temporaryPassword: optionalString(formData.get("temporaryPassword")),
    tenantId: optionalString(formData.get("tenantId")),
  });
  if (!input.success) redirect("/app/customers?error=invalid");
  return postControlPlane("/v1/control-plane/customers", input.data, "/app/customers");
}

export async function createDomain(formData: FormData): Promise<never> {
  const input = createDomainRequestSchema.safeParse({
    hostname: formData.get("hostname"),
    kind: formData.get("kind"),
    schemaVersion: "1",
    tenantId: optionalString(formData.get("tenantId")),
  });
  if (!input.success) redirect("/app/domains?error=invalid");
  return postControlPlane("/v1/control-plane/domains", input.data, "/app/domains");
}

export async function createRole(formData: FormData): Promise<never> {
  const input = createRoleRequestSchema.safeParse({
    description: formData.get("description"),
    name: formData.get("name"),
    permissions: formData.getAll("permissions"),
    schemaVersion: "1",
    tenantId: optionalString(formData.get("tenantId")),
  });
  if (!input.success) redirect("/app/access?error=invalid");
  return postControlPlane("/v1/control-plane/roles", input.data, "/app/access");
}

export async function createManagedUser(formData: FormData): Promise<never> {
  const input = createManagedUserRequestSchema.safeParse({
    customRoleIds: formData.getAll("customRoleIds"),
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    schemaVersion: "1",
    systemRole: formData.get("systemRole"),
    temporaryPassword: formData.get("temporaryPassword"),
    tenantId: optionalString(formData.get("tenantId")),
  });
  if (!input.success) redirect("/app/access?error=invalid");
  return postControlPlane("/v1/control-plane/users", input.data, "/app/access");
}

export async function createSubscription(formData: FormData): Promise<never> {
  const input = upsertBillingSubscriptionRequestSchema.safeParse({
    amountMinor: formData.get("amountMinor"),
    billingKind: formData.get("billingKind"),
    currency: formData.get("currency"),
    customerId: optionalString(formData.get("customerId")),
    interval: formData.get("interval"),
    nextBillingAt: utcInstant(formData.get("nextBillingAt")),
    planCode: formData.get("planCode"),
    planName: formData.get("planName"),
    schemaVersion: "1",
    status: formData.get("status"),
    tenantId: optionalString(formData.get("tenantId")),
  });
  if (!input.success) redirect("/app/billing?error=invalid");
  return postControlPlane("/v1/control-plane/subscriptions", input.data, "/app/billing");
}

export async function createInvoice(formData: FormData): Promise<never> {
  const input = createBillingInvoiceRequestSchema.safeParse({
    amountDueMinor: formData.get("amountDueMinor"),
    billingKind: formData.get("billingKind"),
    currency: formData.get("currency"),
    customerId: optionalString(formData.get("customerId")),
    dueAt: utcInstant(formData.get("dueAt")),
    invoiceNumber: formData.get("invoiceNumber"),
    schemaVersion: "1",
    tenantId: optionalString(formData.get("tenantId")),
  });
  if (!input.success) redirect("/app/billing?error=invalid");
  return postControlPlane("/v1/control-plane/invoices", input.data, "/app/billing");
}

export async function resetCustomerPasswordAction(formData: FormData): Promise<never> {
  const customerId = formData.get("customerId");
  const newPassword = formData.get("newPassword");
  const email = optionalString(formData.get("email"));

  if (typeof customerId !== "string" || !customerId || typeof newPassword !== "string" || newPassword.length < 12) {
    redirect("/app/customers?error=password-invalid");
  }

  const response = await fetchAuthorizedApi(`/v1/control-plane/customers/${customerId}/reset-password`, {
    body: JSON.stringify({
      newPassword,
      ...(email ? { email } : {}),
      schemaVersion: "1",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (response === null || !response.ok) {
    redirect("/app/customers?error=reset-failed");
  }

  revalidatePath("/app/customers");
  redirect("/app/customers?reset=1");
}

export async function deleteCustomerAction(formData: FormData): Promise<never> {
  const customerId = formData.get("customerId");
  if (typeof customerId !== "string" || !customerId) {
    redirect("/app/customers?error=delete-failed");
  }

  const response = await fetchAuthorizedApi(`/v1/control-plane/customers/${customerId}`, {
    method: "DELETE",
  });

  if (response === null || !response.ok) {
    redirect("/app/customers?error=delete-failed");
  }

  revalidatePath("/app/customers");
  revalidatePath("/app/overview");
  redirect("/app/customers?deleted=1");
}

export async function deleteUserAction(formData: FormData): Promise<never> {
  const actorId = formData.get("actorId");
  if (typeof actorId !== "string" || !actorId) {
    redirect("/app/access?error=delete-failed");
  }

  const response = await fetchAuthorizedApi(`/v1/control-plane/users/${actorId}`, {
    method: "DELETE",
  });

  if (response === null || !response.ok) {
    redirect("/app/access?error=delete-failed");
  }

  revalidatePath("/app/access");
  redirect("/app/access?deleted=1");
}


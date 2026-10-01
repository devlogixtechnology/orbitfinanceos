import {
  accessRoleSchema,
  billingInvoiceSchema,
  billingSubscriptionSchema,
  controlPlaneSnapshotSchema,
  customerSchema,
  managedUserSchema,
  tenantDomainSchema,
  tenantSchema,
  type BillingInvoice,
  type BillingSubscription,
  type ControlPlaneSnapshot,
  type CreateBillingInvoiceRequest,
  type CreateCustomerRequest,
  type CreateDomainRequest,
  type CreateManagedUserRequest,
  type CreateRoleRequest,
  type CreateTenantRequest,
  type Customer,
  type ManagedUser,
  type ProvisionWorkspaceRequest,
  type Tenant,
  type TenantDomain,
  type AccessRole,
  type UpsertBillingSubscriptionRequest,
} from "@orbitos/canonical-model";
import { sql, type Kysely, type Transaction } from "kysely";
import { randomBytes, randomUUID } from "node:crypto";

import type { DatabaseSchema } from "./index.js";

export interface ControlPlaneAccess {
  readonly actorId: string;
  readonly platformAccess: boolean;
  readonly tenantId: string;
}

export interface CreateManagedUserCommand {
  readonly input: CreateManagedUserRequest;
  readonly passwordHash: string;
  readonly targetTenantId: string;
}

export interface ProvisionWorkspaceCommand {
  readonly input: ProvisionWorkspaceRequest;
  readonly passwordHash: string;
}

export interface ControlPlaneRepository {
  createCustomer(access: ControlPlaneAccess, input: CreateCustomerRequest, targetTenantId: string, passwordHash?: string): Promise<Customer>;
  createDomain(access: ControlPlaneAccess, input: CreateDomainRequest, targetTenantId: string): Promise<TenantDomain>;
  createInvoice(access: ControlPlaneAccess, input: CreateBillingInvoiceRequest, targetTenantId: string): Promise<BillingInvoice>;
  createRole(access: ControlPlaneAccess, input: CreateRoleRequest, targetTenantId: string): Promise<AccessRole>;
  createSubscription(access: ControlPlaneAccess, input: UpsertBillingSubscriptionRequest, targetTenantId: string): Promise<BillingSubscription>;
  createTenant(access: ControlPlaneAccess, input: CreateTenantRequest): Promise<Tenant>;
  createUser(access: ControlPlaneAccess, command: CreateManagedUserCommand): Promise<ManagedUser>;
  deleteCustomer(access: ControlPlaneAccess, customerId: string, targetTenantId: string): Promise<void>;
  deleteUser(access: ControlPlaneAccess, actorId: string, targetTenantId: string): Promise<void>;
  provisionWorkspace(access: ControlPlaneAccess, command: ProvisionWorkspaceCommand): Promise<Tenant>;
  resetCustomerPassword(
    access: ControlPlaneAccess,
    targetTenantId: string,
    customerId: string,
    newPasswordHash: string,
    newEmail?: string,
    newPasswordPlain?: string,
  ): Promise<{ customerId: string; email: string }>;
  snapshot(access: ControlPlaneAccess): Promise<ControlPlaneSnapshot>;
}

export class ControlPlaneConflictError extends Error {}

function requiredRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("The database did not return the created control-plane record.");
  return row;
}

async function withControlPlaneTransaction<T>(
  database: Kysely<DatabaseSchema>,
  access: ControlPlaneAccess,
  tenantId: string,
  operation: (transaction: Transaction<DatabaseSchema>) => Promise<T>,
): Promise<T> {
  if (!access.platformAccess && tenantId !== access.tenantId) {
    throw new Error("Cross-tenant control-plane access was denied.");
  }
  return database.transaction().execute(async (transaction) => {
    await sql`select set_config('app.tenant_id', ${tenantId}, true)`.execute(transaction);
    await sql`select set_config('app.platform_access', ${access.platformAccess ? "true" : "false"}, true)`.execute(transaction);
    return operation(transaction);
  });
}

async function appendAuditEvent(
  transaction: Transaction<DatabaseSchema>,
  access: ControlPlaneAccess,
  tenantId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  afterState: unknown,
): Promise<void> {
  const localActorId = access.tenantId === tenantId ? access.actorId : null;
  await sql`
    insert into orbit.audit_events (
      tenant_id, id, actor_id, action, resource_type, resource_id,
      correlation_id, after_state
    ) values (
      ${tenantId}::uuid, ${randomUUID()}::uuid, ${localActorId}::uuid,
      ${action}, ${resourceType}, ${resourceId}::uuid,
      ${randomUUID()}, ${JSON.stringify(afterState)}::jsonb
    )
  `.execute(transaction);
}

function mapTenant(row: Record<string, unknown>): Tenant {
  return tenantSchema.parse({
    createdAt: (row.created_at as Date).toISOString(),
    displayName: row.display_name,
    slug: row.slug,
    status: row.status,
    tenantId: row.id,
  });
}

function mapCustomer(row: Record<string, unknown>): Customer {
  return customerSchema.parse({
    createdAt: (row.created_at as Date).toISOString(),
    customerId: row.id,
    displayName: row.display_name,
    ...(typeof row.email === "string" ? { email: row.email } : {}),
    externalReference: row.external_reference,
    ...(typeof row.initial_password === "string" ? { initialPassword: row.initial_password } : {}),
    status: row.status,
    tenantId: row.tenant_id,
  });
}

function mapDomain(row: Record<string, unknown>): TenantDomain {
  return tenantDomainSchema.parse({
    createdAt: (row.created_at as Date).toISOString(),
    domainId: row.id,
    hostname: row.hostname,
    kind: row.kind,
    status: row.status,
    tenantId: row.tenant_id,
    verificationToken: row.verification_token,
  });
}

function mapRole(row: Record<string, unknown>): AccessRole {
  return accessRoleSchema.parse({
    createdAt: (row.created_at as Date).toISOString(),
    description: row.description,
    managed: false,
    name: row.name,
    permissions: row.permissions ?? [],
    roleId: row.id,
    tenantId: row.tenant_id,
  });
}

function mapUser(row: Record<string, unknown>): ManagedUser {
  return managedUserSchema.parse({
    actorId: row.id,
    createdAt: (row.created_at as Date).toISOString(),
    ...(typeof row.customer_id === "string" ? { customerId: row.customer_id } : {}),
    displayName: row.display_name,
    email: row.email,
    enabled: row.enabled,
    ...(typeof row.initial_password === "string" ? { initialPassword: row.initial_password } : {}),
    roles: row.roles ?? [],
    tenantId: row.tenant_id,
  });
}

function mapSubscription(row: Record<string, unknown>): BillingSubscription {
  return billingSubscriptionSchema.parse({
    amountMinor: String(row.amount_minor),
    billingKind: row.billing_kind,
    createdAt: (row.created_at as Date).toISOString(),
    currency: row.currency,
    customerId: row.customer_id ?? undefined,
    interval: row.interval,
    nextBillingAt: row.next_billing_at instanceof Date ? row.next_billing_at.toISOString() : undefined,
    planCode: row.plan_code,
    planName: row.plan_name,
    status: row.status,
    subscriptionId: row.id,
    tenantId: row.tenant_id,
  });
}

function mapInvoice(row: Record<string, unknown>): BillingInvoice {
  return billingInvoiceSchema.parse({
    amountDueMinor: String(row.amount_due_minor),
    amountPaidMinor: String(row.amount_paid_minor),
    billingKind: row.billing_kind,
    createdAt: (row.created_at as Date).toISOString(),
    currency: row.currency,
    customerId: row.customer_id ?? undefined,
    dueAt: (row.due_at as Date).toISOString(),
    invoiceId: row.id,
    invoiceNumber: row.invoice_number,
    status: row.status,
    tenantId: row.tenant_id,
  });
}

export class PostgresControlPlaneRepository implements ControlPlaneRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async snapshot(access: ControlPlaneAccess): Promise<ControlPlaneSnapshot> {
    return withControlPlaneTransaction(this.database, access, access.tenantId, async (transaction) => {
      const [tenants, customers, domains, roles, users, subscriptions, invoices] = await Promise.all([
        sql<Record<string, unknown>>`select id, display_name, slug, status, created_at from orbit.tenants order by display_name`.execute(transaction),
        sql<Record<string, unknown>>`select tenant_id, id, display_name, external_reference, status, email, initial_password, created_at from orbit.customers order by display_name`.execute(transaction),
        sql<Record<string, unknown>>`select tenant_id, id, hostname, kind, status, verification_token, created_at from orbit.tenant_domains order by hostname`.execute(transaction),
        sql<Record<string, unknown>>`
          select roles.tenant_id, roles.id, roles.name, roles.description, roles.created_at,
            coalesce(array_agg(permissions.permission order by permissions.permission)
              filter (where permissions.permission is not null), array[]::text[]) as permissions
          from orbit.custom_roles as roles
          left join orbit.custom_role_permissions as permissions
            on permissions.tenant_id = roles.tenant_id and permissions.role_id = roles.id
          group by roles.tenant_id, roles.id
          order by roles.name
        `.execute(transaction),
        sql<Record<string, unknown>>`
          select actors.tenant_id, actors.id, actors.customer_id, actors.display_name, actors.created_at,
            credentials.email, credentials.enabled, credentials.initial_password,
            array(
              select role_name from (
                select memberships.role as role_name
                from orbit.memberships as memberships
                where memberships.tenant_id = actors.tenant_id and memberships.actor_id = actors.id
                union
                select custom_roles.name as role_name
                from orbit.custom_role_assignments as assignments
                join orbit.custom_roles on custom_roles.tenant_id = assignments.tenant_id and custom_roles.id = assignments.role_id
                where assignments.tenant_id = actors.tenant_id and assignments.actor_id = actors.id
              ) as assigned_roles order by role_name
            ) as roles
          from orbit.actors as actors
          join orbit.auth_credentials as credentials
            on credentials.tenant_id = actors.tenant_id and credentials.actor_id = actors.id
          order by actors.display_name
        `.execute(transaction),
        sql<Record<string, unknown>>`select * from orbit.billing_subscriptions order by created_at desc`.execute(transaction),
        sql<Record<string, unknown>>`select * from orbit.billing_invoices order by created_at desc`.execute(transaction),
      ]);

      return controlPlaneSnapshotSchema.parse({
        customers: customers.rows.map(mapCustomer),
        domains: domains.rows.map(mapDomain),
        invoices: invoices.rows.map(mapInvoice),
        roles: roles.rows.map(mapRole),
        schemaVersion: "1",
        subscriptions: subscriptions.rows.map(mapSubscription),
        tenants: tenants.rows.map(mapTenant),
        users: users.rows.map(mapUser),
      });
    });
  }

  async createTenant(access: ControlPlaneAccess, input: CreateTenantRequest): Promise<Tenant> {
    if (!access.platformAccess) throw new Error("Platform access is required to create a tenant.");
    const tenantId = randomUUID();
    return withControlPlaneTransaction(this.database, access, access.tenantId, async (transaction) => {
      try {
        const inserted = await sql<Record<string, unknown>>`
          insert into orbit.tenants (id, display_name, slug)
          values (${tenantId}::uuid, ${input.displayName}, ${input.slug})
          returning id, display_name, slug, status, created_at
        `.execute(transaction);
        const tenant = mapTenant(requiredRow(inserted.rows));
        await sql`
          insert into orbit.tenant_domains (
            tenant_id, id, hostname, kind, status, verification_token
          ) values (
            ${tenantId}::uuid, ${randomUUID()}::uuid,
            ${`${input.slug}.orbitos.devlogix.com.pk`}, 'platform_subdomain',
            'pending_dns', ${randomBytes(18).toString("base64url")}
          )
        `.execute(transaction);
        await sql`select set_config('app.tenant_id', ${tenantId}, true)`.execute(transaction);
        await appendAuditEvent(transaction, access, tenantId, "tenant:created", "tenant", tenantId, tenant);
        return tenant;
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
          throw new ControlPlaneConflictError("A tenant with this slug already exists.");
        }
        throw error;
      }
    });
  }

  async provisionWorkspace(access: ControlPlaneAccess, command: ProvisionWorkspaceCommand): Promise<Tenant> {
    if (!access.platformAccess) throw new Error("Platform access is required to provision a workspace.");
    const tenantId = randomUUID();
    const actorId = randomUUID();
    const { administrator, ...workspace } = command.input;
    return withControlPlaneTransaction(this.database, access, access.tenantId, async (transaction) => {
      try {
        const inserted = await sql<Record<string, unknown>>`
          insert into orbit.tenants (id, display_name, slug)
          values (${tenantId}::uuid, ${workspace.displayName}, ${workspace.slug})
          returning id, display_name, slug, status, created_at
        `.execute(transaction);
        const tenant = mapTenant(requiredRow(inserted.rows));
        await sql`
          insert into orbit.tenant_domains (
            tenant_id, id, hostname, kind, status, verification_token
          ) values (
            ${tenantId}::uuid, ${randomUUID()}::uuid,
            ${`${workspace.slug}.orbitos.devlogix.com.pk`}, 'platform_subdomain',
            'pending_dns', ${randomBytes(18).toString("base64url")}
          )
        `.execute(transaction);
        await sql`select set_config('app.tenant_id', ${tenantId}, true)`.execute(transaction);
        await sql`
          insert into orbit.actors (tenant_id, id, external_subject, display_name)
          values (${tenantId}::uuid, ${actorId}::uuid, ${`password:${administrator.email}`}, ${administrator.displayName})
        `.execute(transaction);
        await sql`
          insert into orbit.memberships (tenant_id, actor_id, role)
          values (${tenantId}::uuid, ${actorId}::uuid, 'tenant_admin')
        `.execute(transaction);
        await sql`
          insert into orbit.auth_credentials (tenant_id, actor_id, email, password_hash)
          values (${tenantId}::uuid, ${actorId}::uuid, ${administrator.email}, ${command.passwordHash})
        `.execute(transaction);
        await appendAuditEvent(transaction, access, tenantId, "tenant:created", "tenant", tenantId, tenant);
        await appendAuditEvent(transaction, access, tenantId, "user:created", "actor", actorId, {
          actorId,
          displayName: administrator.displayName,
          email: administrator.email,
          enabled: true,
          roles: ["tenant_admin"],
          tenantId,
        });
        return tenant;
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
          throw new ControlPlaneConflictError("A company workspace with this slug or administrator already exists.");
        }
        throw error;
      }
    });
  }

  async createCustomer(access: ControlPlaneAccess, input: CreateCustomerRequest, targetTenantId: string, passwordHash?: string): Promise<Customer> {
    const id = randomUUID();
    return withControlPlaneTransaction(this.database, access, targetTenantId, async (transaction) => {
      const result = await sql<Record<string, unknown>>`
        insert into orbit.customers (tenant_id, id, display_name, external_reference, email, initial_password)
        values (${targetTenantId}::uuid, ${id}::uuid, ${input.displayName}, ${input.externalReference}, ${input.email ?? null}, ${input.temporaryPassword ?? null})
        returning tenant_id, id, display_name, external_reference, status, email, initial_password, created_at
      `.execute(transaction);
      const customer = mapCustomer(requiredRow(result.rows));
      if (input.email !== undefined && passwordHash !== undefined) {
        const actorId = randomUUID();
        await sql`
          insert into orbit.actors (tenant_id, id, external_subject, display_name, customer_id)
          values (${targetTenantId}::uuid, ${actorId}::uuid, ${`password:${input.email}`}, ${input.displayName}, ${id}::uuid)
        `.execute(transaction);
        await sql`
          insert into orbit.memberships (tenant_id, actor_id, role)
          values (${targetTenantId}::uuid, ${actorId}::uuid, 'user')
        `.execute(transaction);
        await sql`
          insert into orbit.auth_credentials (tenant_id, actor_id, email, password_hash, initial_password)
          values (${targetTenantId}::uuid, ${actorId}::uuid, ${input.email}, ${passwordHash}, ${input.temporaryPassword ?? null})
        `.execute(transaction);
        await appendAuditEvent(transaction, access, targetTenantId, "user:created", "actor", actorId, {
          actorId,
          customerId: id,
          displayName: input.displayName,
          email: input.email,
          enabled: true,
          roles: ["user"],
          tenantId: targetTenantId,
        });
      }
      await appendAuditEvent(transaction, access, targetTenantId, "customer:created", "customer", id, customer);
      return customer;
    });
  }

  async resetCustomerPassword(
    access: ControlPlaneAccess,
    targetTenantId: string,
    customerId: string,
    newPasswordHash: string,
    newEmail?: string,
    newPasswordPlain?: string,
  ): Promise<{ customerId: string; email: string }> {
    return withControlPlaneTransaction(this.database, access, targetTenantId, async (transaction) => {
      const customerResult = await sql<Record<string, unknown>>`
        select id, display_name, email from orbit.customers
        where tenant_id = ${targetTenantId}::uuid and id = ${customerId}::uuid
      `.execute(transaction);
      const customer = customerResult.rows[0];
      if (!customer) {
        throw new Error(`Customer ${customerId} was not found.`);
      }

      const effectiveEmail = newEmail ?? (customer.email as string | undefined);
      if (!effectiveEmail) {
        throw new Error(`Customer ${customerId} has no login email configured.`);
      }

      await sql`
        update orbit.customers
        set email = ${effectiveEmail},
          initial_password = coalesce(${newPasswordPlain ?? null}, initial_password)
        where tenant_id = ${targetTenantId}::uuid and id = ${customerId}::uuid
      `.execute(transaction);

      const actorResult = await sql<Record<string, unknown>>`
        select id from orbit.actors
        where tenant_id = ${targetTenantId}::uuid and customer_id = ${customerId}::uuid
        limit 1
      `.execute(transaction);

      let actorId = actorResult.rows[0]?.id as string | undefined;

      if (actorId) {
        await sql`
          update orbit.auth_credentials
          set password_hash = ${newPasswordHash}, email = ${effectiveEmail},
            initial_password = coalesce(${newPasswordPlain ?? null}, initial_password),
            enabled = true, updated_at = statement_timestamp()
          where tenant_id = ${targetTenantId}::uuid and actor_id = ${actorId}::uuid
        `.execute(transaction);

        if (newEmail) {
          await sql`
            update orbit.actors
            set external_subject = ${`password:${effectiveEmail}`}
            where tenant_id = ${targetTenantId}::uuid and id = ${actorId}::uuid
          `.execute(transaction);
        }

        await sql`
          update orbit.auth_sessions
          set revoked_at = statement_timestamp()
          where tenant_id = ${targetTenantId}::uuid and actor_id = ${actorId}::uuid and revoked_at is null
        `.execute(transaction);
      } else {
        actorId = randomUUID();
        await sql`
          insert into orbit.actors (tenant_id, id, external_subject, display_name, customer_id)
          values (${targetTenantId}::uuid, ${actorId}::uuid, ${`password:${effectiveEmail}`}, ${customer.display_name}, ${customerId}::uuid)
        `.execute(transaction);
        await sql`
          insert into orbit.memberships (tenant_id, actor_id, role)
          values (${targetTenantId}::uuid, ${actorId}::uuid, 'user')
        `.execute(transaction);
        await sql`
          insert into orbit.auth_credentials (tenant_id, actor_id, email, password_hash, initial_password)
          values (${targetTenantId}::uuid, ${actorId}::uuid, ${effectiveEmail}, ${newPasswordHash}, ${newPasswordPlain ?? null})
        `.execute(transaction);
      }

      await appendAuditEvent(transaction, access, targetTenantId, "customer:password_reset", "customer", customerId, {
        customerId,
        email: effectiveEmail,
        updatedAt: new Date().toISOString(),
      });

      return { customerId, email: effectiveEmail };
    });
  }

  async deleteCustomer(access: ControlPlaneAccess, customerId: string, targetTenantId: string): Promise<void> {
    return withControlPlaneTransaction(this.database, access, targetTenantId, async (transaction) => {
      const actors = await sql<{ id: string }>`
        select id from orbit.actors
        where tenant_id = ${targetTenantId}::uuid and customer_id = ${customerId}::uuid
      `.execute(transaction);
      for (const actor of actors.rows) {
        await sql`delete from orbit.auth_sessions where tenant_id = ${targetTenantId}::uuid and actor_id = ${actor.id}::uuid`.execute(transaction);
        await sql`delete from orbit.auth_credentials where tenant_id = ${targetTenantId}::uuid and actor_id = ${actor.id}::uuid`.execute(transaction);
        await sql`delete from orbit.memberships where tenant_id = ${targetTenantId}::uuid and actor_id = ${actor.id}::uuid`.execute(transaction);
        await sql`delete from orbit.custom_role_assignments where tenant_id = ${targetTenantId}::uuid and actor_id = ${actor.id}::uuid`.execute(transaction);
        await sql`delete from orbit.actors where tenant_id = ${targetTenantId}::uuid and id = ${actor.id}::uuid`.execute(transaction);
      }
      await sql`delete from orbit.csv_imports where tenant_id = ${targetTenantId}::uuid and customer_id = ${customerId}::uuid`.execute(transaction);
      await sql`delete from orbit.data_connections where tenant_id = ${targetTenantId}::uuid and customer_id = ${customerId}::uuid`.execute(transaction);
      await sql`delete from orbit.integrations where tenant_id = ${targetTenantId}::uuid and customer_id = ${customerId}::uuid`.execute(transaction);
      await sql`delete from orbit.reconciliation_results where tenant_id = ${targetTenantId}::uuid and customer_id = ${customerId}::uuid`.execute(transaction);
      await sql`delete from orbit.customers where tenant_id = ${targetTenantId}::uuid and id = ${customerId}::uuid`.execute(transaction);
      await appendAuditEvent(transaction, access, targetTenantId, "customer:deleted", "customer", customerId, { customerId });
    });
  }

  async deleteUser(access: ControlPlaneAccess, actorId: string, targetTenantId: string): Promise<void> {
    return withControlPlaneTransaction(this.database, access, targetTenantId, async (transaction) => {
      await sql`delete from orbit.auth_sessions where tenant_id = ${targetTenantId}::uuid and actor_id = ${actorId}::uuid`.execute(transaction);
      await sql`delete from orbit.auth_credentials where tenant_id = ${targetTenantId}::uuid and actor_id = ${actorId}::uuid`.execute(transaction);
      await sql`delete from orbit.memberships where tenant_id = ${targetTenantId}::uuid and actor_id = ${actorId}::uuid`.execute(transaction);
      await sql`delete from orbit.custom_role_assignments where tenant_id = ${targetTenantId}::uuid and actor_id = ${actorId}::uuid`.execute(transaction);
      await sql`delete from orbit.actors where tenant_id = ${targetTenantId}::uuid and id = ${actorId}::uuid`.execute(transaction);
      await appendAuditEvent(transaction, access, targetTenantId, "user:deleted", "actor", actorId, { actorId });
    });
  }

  async createDomain(access: ControlPlaneAccess, input: CreateDomainRequest, targetTenantId: string): Promise<TenantDomain> {
    const id = randomUUID();
    return withControlPlaneTransaction(this.database, access, targetTenantId, async (transaction) => {
      const result = await sql<Record<string, unknown>>`
        insert into orbit.tenant_domains (tenant_id, id, hostname, kind, verification_token)
        values (${targetTenantId}::uuid, ${id}::uuid, ${input.hostname}, ${input.kind}, ${randomBytes(18).toString("base64url")})
        returning tenant_id, id, hostname, kind, status, verification_token, created_at
      `.execute(transaction);
      const domain = mapDomain(requiredRow(result.rows));
      await appendAuditEvent(transaction, access, targetTenantId, "domain:created", "tenant_domain", id, domain);
      return domain;
    });
  }

  async createRole(access: ControlPlaneAccess, input: CreateRoleRequest, targetTenantId: string): Promise<AccessRole> {
    const id = randomUUID();
    return withControlPlaneTransaction(this.database, access, targetTenantId, async (transaction) => {
      const result = await sql<Record<string, unknown>>`
        insert into orbit.custom_roles (tenant_id, id, name, description)
        values (${targetTenantId}::uuid, ${id}::uuid, ${input.name}, ${input.description})
        returning tenant_id, id, name, description, created_at
      `.execute(transaction);
      for (const permission of [...new Set(input.permissions)]) {
        await sql`
          insert into orbit.custom_role_permissions (tenant_id, role_id, permission)
          values (${targetTenantId}::uuid, ${id}::uuid, ${permission})
        `.execute(transaction);
      }
      const role = mapRole({ ...requiredRow(result.rows), permissions: [...new Set(input.permissions)].sort() });
      await appendAuditEvent(transaction, access, targetTenantId, "role:created", "custom_role", id, role);
      return role;
    });
  }

  async createUser(access: ControlPlaneAccess, command: CreateManagedUserCommand): Promise<ManagedUser> {
    const id = randomUUID();
    const { input, targetTenantId } = command;
    return withControlPlaneTransaction(this.database, access, targetTenantId, async (transaction) => {
      await sql`
        insert into orbit.actors (tenant_id, id, external_subject, display_name)
        values (${targetTenantId}::uuid, ${id}::uuid, ${`password:${input.email}`}, ${input.displayName})
      `.execute(transaction);
      await sql`
        insert into orbit.memberships (tenant_id, actor_id, role)
        values (${targetTenantId}::uuid, ${id}::uuid, ${input.systemRole})
      `.execute(transaction);
      await sql`
        insert into orbit.auth_credentials (tenant_id, actor_id, email, password_hash, initial_password)
        values (${targetTenantId}::uuid, ${id}::uuid, ${input.email}, ${command.passwordHash}, ${input.temporaryPassword ?? null})
      `.execute(transaction);
      for (const roleId of [...new Set(input.customRoleIds)]) {
        await sql`
          insert into orbit.custom_role_assignments (tenant_id, actor_id, role_id)
          values (${targetTenantId}::uuid, ${id}::uuid, ${roleId}::uuid)
        `.execute(transaction);
      }
      const user = managedUserSchema.parse({
        actorId: id,
        createdAt: new Date().toISOString(),
        displayName: input.displayName,
        email: input.email,
        enabled: true,
        roles: [input.systemRole],
        tenantId: targetTenantId,
      });
      await appendAuditEvent(transaction, access, targetTenantId, "user:created", "actor", id, { ...user, temporaryPassword: undefined });
      return user;
    });
  }

  async createSubscription(access: ControlPlaneAccess, input: UpsertBillingSubscriptionRequest, targetTenantId: string): Promise<BillingSubscription> {
    const id = randomUUID();
    return withControlPlaneTransaction(this.database, access, targetTenantId, async (transaction) => {
      const result = await sql<Record<string, unknown>>`
        insert into orbit.billing_subscriptions (
          tenant_id, id, customer_id, billing_kind, plan_code, plan_name,
          amount_minor, currency, interval, status, next_billing_at
        ) values (
          ${targetTenantId}::uuid, ${id}::uuid, ${input.customerId ?? null}::uuid,
          ${input.billingKind}, ${input.planCode}, ${input.planName},
          ${input.amountMinor}::bigint, ${input.currency}, ${input.interval},
          ${input.status}, ${input.nextBillingAt ?? null}::timestamptz
        ) returning *
      `.execute(transaction);
      const subscription = mapSubscription(requiredRow(result.rows));
      await appendAuditEvent(transaction, access, targetTenantId, "billing:subscription_created", "billing_subscription", id, subscription);
      return subscription;
    });
  }

  async createInvoice(access: ControlPlaneAccess, input: CreateBillingInvoiceRequest, targetTenantId: string): Promise<BillingInvoice> {
    const id = randomUUID();
    return withControlPlaneTransaction(this.database, access, targetTenantId, async (transaction) => {
      const result = await sql<Record<string, unknown>>`
        insert into orbit.billing_invoices (
          tenant_id, id, customer_id, billing_kind, invoice_number,
          amount_due_minor, currency, due_at
        ) values (
          ${targetTenantId}::uuid, ${id}::uuid, ${input.customerId ?? null}::uuid,
          ${input.billingKind}, ${input.invoiceNumber}, ${input.amountDueMinor}::bigint,
          ${input.currency}, ${input.dueAt}::timestamptz
        ) returning *
      `.execute(transaction);
      const invoice = mapInvoice(requiredRow(result.rows));
      await appendAuditEvent(transaction, access, targetTenantId, "billing:invoice_created", "billing_invoice", id, invoice);
      return invoice;
    });
  }
}

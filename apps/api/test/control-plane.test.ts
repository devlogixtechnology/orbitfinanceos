import { permissionsForRoles, type SessionAuthenticator } from "@orbitos/authz";
import type { SessionContext, Tenant } from "@orbitos/canonical-model";
import type { ControlPlaneRepository } from "@orbitos/database";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildServer } from "../src/server.js";

const tenant: Tenant = {
  createdAt: "2026-09-30T00:00:00.000Z",
  displayName: "Albore Capital",
  slug: "albore",
  status: "active",
  tenantId: "33333333-3333-4333-8333-333333333333",
};

function session(role: "super_admin" | "tenant_admin" | "admin"): SessionContext {
  return {
    actor: { actorId: "11111111-1111-4111-8111-111111111111", subject: "password:test@example.com" },
    authenticatedAt: "2026-09-30T00:00:00.000Z",
    expiresAt: "2026-09-30T08:00:00.000Z",
    permissions: [...permissionsForRoles([role])],
    roles: [role],
    schemaVersion: "1",
    tenant: { displayName: "OrbitOS Platform", tenantId: "22222222-2222-4222-8222-222222222222" },
  };
}

const createTenant = vi.fn<ControlPlaneRepository["createTenant"]>(() => Promise.resolve(tenant));
const provisionWorkspace = vi.fn<ControlPlaneRepository["provisionWorkspace"]>(() => Promise.resolve(tenant));
const repository = {
  createCustomer: vi.fn<ControlPlaneRepository["createCustomer"]>(),
  createDomain: vi.fn<ControlPlaneRepository["createDomain"]>(),
  createInvoice: vi.fn<ControlPlaneRepository["createInvoice"]>(),
  createRole: vi.fn<ControlPlaneRepository["createRole"]>(),
  createSubscription: vi.fn<ControlPlaneRepository["createSubscription"]>(),
  createTenant,
  createUser: vi.fn<ControlPlaneRepository["createUser"]>(),
  deleteCustomer: vi.fn<ControlPlaneRepository["deleteCustomer"]>(),
  deleteUser: vi.fn<ControlPlaneRepository["deleteUser"]>(),
  provisionWorkspace,
  resetCustomerPassword: vi.fn<ControlPlaneRepository["resetCustomerPassword"]>(),
  snapshot: vi.fn<ControlPlaneRepository["snapshot"]>(),
} satisfies ControlPlaneRepository;

const servers = new Set<ReturnType<typeof buildServer>>();

afterEach(async () => {
  createTenant.mockClear();
  provisionWorkspace.mockClear();
  await Promise.all([...servers].map(async (server) => server.close()));
  servers.clear();
});

describe("reseller control-plane authorization", () => {
  it("provisions a company and first workspace administrator atomically", async () => {
    const authenticator: SessionAuthenticator = { authenticate: () => Promise.resolve(session("super_admin")) };
    const server = buildServer({ authenticator, controlPlaneRepository: repository });
    servers.add(server);

    const response = await server.inject({
      headers: { authorization: "Bearer valid" },
      method: "POST",
      payload: {
        administrator: {
          displayName: "Utopia Administrator",
          email: "administrator@utopia.example",
          temporaryPassword: "temporary-password-2026",
        },
        displayName: "Utopia",
        schemaVersion: "1",
        slug: "utopia",
      },
      url: "/v1/control-plane/workspaces",
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(tenant);
    expect(provisionWorkspace).toHaveBeenCalledOnce();
    expect(provisionWorkspace.mock.calls[0]?.[1]).toMatchObject({
      input: { administrator: { email: "administrator@utopia.example" }, slug: "utopia" },
    });
    expect(provisionWorkspace.mock.calls[0]?.[1].passwordHash).not.toContain("temporary-password-2026");
  });

  it("allows a super admin to create a reseller tenant", async () => {
    const authenticator: SessionAuthenticator = { authenticate: () => Promise.resolve(session("super_admin")) };
    const server = buildServer({ authenticator, controlPlaneRepository: repository });
    servers.add(server);

    const response = await server.inject({
      headers: { authorization: "Bearer valid" },
      method: "POST",
      payload: { displayName: "Albore Capital", schemaVersion: "1", slug: "albore" },
      url: "/v1/control-plane/tenants",
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(tenant);
    expect(createTenant).toHaveBeenCalledOnce();
  });

  it("prevents a tenant admin from creating another tenant", async () => {
    const authenticator: SessionAuthenticator = { authenticate: () => Promise.resolve(session("tenant_admin")) };
    const server = buildServer({ authenticator, controlPlaneRepository: repository });
    servers.add(server);

    const response = await server.inject({
      headers: { authorization: "Bearer valid" },
      method: "POST",
      payload: { displayName: "Albore Capital", schemaVersion: "1", slug: "albore" },
      url: "/v1/control-plane/tenants",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "PERMISSION_DENIED" } });
    expect(createTenant).not.toHaveBeenCalled();
  });

  it("prevents an admin from elevating another user to admin", async () => {
    const authenticator: SessionAuthenticator = { authenticate: () => Promise.resolve(session("admin")) };
    const server = buildServer({ authenticator, controlPlaneRepository: repository });
    servers.add(server);

    const response = await server.inject({
      headers: { authorization: "Bearer valid" },
      method: "POST",
      payload: {
        customRoleIds: [],
        displayName: "Elevated User",
        email: "elevated@example.com",
        schemaVersion: "1",
        systemRole: "admin",
        temporaryPassword: "temporary-password-2026",
      },
      url: "/v1/control-plane/users",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "PERMISSION_DENIED" } });
  });

  it("resets a customer password when authorized", async () => {
    const authenticator: SessionAuthenticator = { authenticate: () => Promise.resolve(session("super_admin")) };
    const resetMock = vi.fn().mockResolvedValue({ customerId: "11111111-1111-4111-8111-111111111111", email: "client@example.com" });
    const repoWithReset = { ...repository, resetCustomerPassword: resetMock };
    const server = buildServer({ authenticator, controlPlaneRepository: repoWithReset });
    servers.add(server);

    const response = await server.inject({
      headers: { authorization: "Bearer valid" },
      method: "POST",
      payload: {
        newPassword: "secure-new-password-2026",
        schemaVersion: "1",
      },
      url: "/v1/control-plane/customers/11111111-1111-4111-8111-111111111111/reset-password",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "success" });
    expect(resetMock).toHaveBeenCalled();
  });
});

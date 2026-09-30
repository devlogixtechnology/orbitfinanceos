import { Key, ShieldCheck, UserPlus, Users } from "@phosphor-icons/react/dist/ssr";

import { PendingSubmitButton } from "../../../components/pending-submit-button";
import { loadAuthorizedSession, loadControlPlane } from "../../../lib/session";
import { createManagedUser, createRole } from "../control-plane-actions";

const permissionOptions = [
  ["customers:read", "View customers"], ["customers:write", "Manage customers"],
  ["users:read", "View users"], ["users:write", "Create users"],
  ["roles:read", "View roles"], ["roles:write", "Create roles"],
  ["domains:read", "View domains"], ["domains:write", "Manage domains"],
  ["billing:read", "View billing"], ["billing:write", "Manage billing"],
  ["integrations:read", "View integrations"], ["integrations:write", "Manage integrations"],
  ["reconciliation:read", "View reconciliation"], ["reconciliation:write", "Run reconciliation"],
  ["exceptions:read", "View exceptions"], ["exceptions:write", "Resolve exceptions"],
] as const;

const roleMatrix = [
  { role: "Super Admin", scope: "All companies", tenants: "Create, suspend, govern", people: "All roles and tenants", billing: "Tenant plans + invoices", operations: "Control plane; tenant data only by explicit tenant context" },
  { role: "Tenant Admin", scope: "One company", tenants: "Own tenant settings", people: "Admins, users, custom roles", billing: "Customer plans + invoices", operations: "Full tenant operations" },
  { role: "Admin", scope: "Assigned tenant", tenants: "View", people: "Create users; no privilege elevation", billing: "View", operations: "Operate integrations, controls, exceptions" },
  { role: "User", scope: "Assigned tenant", tenants: "None", people: "None", billing: "None", operations: "Read/use only as explicitly assigned" },
] as const;

export default async function AccessPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ created?: string; error?: string }> }>) {
  const [session, snapshot, status] = await Promise.all([loadAuthorizedSession(), loadControlPlane(), searchParams]);
  const isPlatform = session?.roles.includes("super_admin") ?? false;
  const isTenantAdmin = isPlatform || (session?.roles.some((role) => role === "tenant_admin" || role === "administrator") ?? false);
  const canCreateUser = session?.permissions.includes("users:write") ?? false;
  const canCreateRole = session?.permissions.includes("roles:write") ?? false;
  const allowedPermissions = permissionOptions.filter(([permission]) => session?.permissions.includes(permission));
  const tenantName = new Map(snapshot?.tenants.map((tenant) => [tenant.tenantId, tenant.displayName]));

  return (
    <main className="page control-page">
      <header className="page-header control-heading"><p className="eyebrow">Identity governance</p><h1>Users, roles & permissions</h1><p>System roles establish the authority ceiling. Custom roles can narrow or combine permissions, but never grant more authority than their creator holds.</p></header>
      {status.created === "1" ? <p className="success-alert">Identity configuration saved.</p> : null}
      {status.error !== undefined ? <p className="form-error">The identity change was rejected. Check role limits, password length, and unique email.</p> : null}

      <section className="control-panel matrix-panel">
        <div className="section-heading"><p className="eyebrow">Authority model</p><h2>System role matrix</h2></div>
        <div className="table-scroll"><table className="role-matrix"><thead><tr><th>Role</th><th>Scope</th><th>Tenant control</th><th>People & roles</th><th>Billing</th><th>Operations</th></tr></thead><tbody>{roleMatrix.map((row) => <tr key={row.role}><td><strong>{row.role}</strong></td><td>{row.scope}</td><td>{row.tenants}</td><td>{row.people}</td><td>{row.billing}</td><td>{row.operations}</td></tr>)}</tbody></table></div>
      </section>

      <div className="access-forms">
        <section className="control-panel form-panel">
          <div className="section-heading"><UserPlus size={20} /><p className="eyebrow">Identity</p><h2>Create user</h2></div>
          {canCreateUser ? <form action={createManagedUser} className="configuration-form embedded-form">
            {isPlatform ? <><label htmlFor="user-tenant">Tenant</label><select id="user-tenant" name="tenantId" required><option value="">Select company</option>{snapshot?.tenants.map((tenant) => <option key={tenant.tenantId} value={tenant.tenantId}>{tenant.displayName}</option>)}</select></> : null}
            <label htmlFor="user-name">Full name</label><input id="user-name" name="displayName" required />
            <label htmlFor="user-email">Email</label><input id="user-email" name="email" required type="email" />
            <label htmlFor="user-role">System role</label><select id="user-role" name="systemRole" required>{isPlatform ? <><option value="tenant_admin">Tenant Admin</option><option value="super_admin">Super Admin</option></> : null}{isTenantAdmin ? <option value="admin">Admin</option> : null}<option value="user">User</option></select>
            <label htmlFor="temporary-password">Temporary password</label><input autoComplete="new-password" id="temporary-password" minLength={12} name="temporaryPassword" required type="password" />
            {isTenantAdmin && !isPlatform && (snapshot?.roles.length ?? 0) > 0 ? <><label>Custom roles</label><div className="permission-grid compact-permissions">{snapshot?.roles.map((role) => <label className="permission-option" key={role.roleId}><input name="customRoleIds" type="checkbox" value={role.roleId} /><span>{role.name}</span></label>)}</div></> : null}
            <p className="form-help">Share the temporary password through a secure channel and require rotation during onboarding.</p>
            <PendingSubmitButton className="primary-button" pendingLabel="Creating user">Create user</PendingSubmitButton>
          </form> : <div className="inline-alert"><strong>User creation unavailable</strong>Your role is read-only for identities.</div>}
        </section>

        <section className="control-panel form-panel">
          <div className="section-heading"><Key size={20} /><p className="eyebrow">Least privilege</p><h2>Custom role</h2></div>
          {canCreateRole ? <form action={createRole} className="configuration-form embedded-form">
            {isPlatform ? <><label htmlFor="role-tenant">Tenant</label><select id="role-tenant" name="tenantId" required><option value="">Select company</option>{snapshot?.tenants.map((tenant) => <option key={tenant.tenantId} value={tenant.tenantId}>{tenant.displayName}</option>)}</select></> : null}
            <label htmlFor="role-name">Role name</label><input id="role-name" name="name" placeholder="Reconciliation reviewer" required />
            <label htmlFor="role-description">Description</label><textarea id="role-description" name="description" rows={3} />
            <label>Permissions</label><div className="permission-grid">{allowedPermissions.map(([permission, label]) => <label className="permission-option" key={permission}><input name="permissions" type="checkbox" value={permission} /><span><strong>{label}</strong><small>{permission}</small></span></label>)}</div>
            <PendingSubmitButton className="primary-button" pendingLabel="Creating role">Create role</PendingSubmitButton>
          </form> : <div className="inline-alert"><strong>Managed roles</strong>Only tenant and platform administrators can create custom roles.</div>}
        </section>
      </div>

      <section className="control-panel">
        <div className="section-heading"><Users size={20} /><p className="eyebrow">Directory</p><h2>Managed users</h2></div>
        {snapshot === null ? <div className="inline-alert">User directory unavailable.</div> : snapshot.users.length === 0 ? <div className="empty-state"><strong>No users found</strong></div> : <div className="table-scroll"><table className="control-table"><thead><tr><th>User</th>{isPlatform ? <th>Tenant</th> : null}<th>Roles</th><th>State</th></tr></thead><tbody>{snapshot.users.map((user) => <tr key={`${user.tenantId}:${user.actorId}`}><td><strong>{user.displayName}</strong><span className="table-subline">{user.email}</span></td>{isPlatform ? <td>{tenantName.get(user.tenantId)}</td> : null}<td><div className="tag-row">{user.roles.map((role) => <span className="role-tag" key={role}>{role.replaceAll("_", " ")}</span>)}</div></td><td><span className={`status-pill status-${user.enabled ? "active" : "suspended"}`}>{user.enabled ? "active" : "disabled"}</span></td></tr>)}</tbody></table></div>}
        <p className="boundary-note"><ShieldCheck size={18} />Super Admin is platform scope; all other roles are tenant-bound.</p>
      </section>
    </main>
  );
}

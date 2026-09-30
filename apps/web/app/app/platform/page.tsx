import { Buildings, Globe, UsersThree } from "@phosphor-icons/react/dist/ssr";

import { PendingSubmitButton } from "../../../components/pending-submit-button";
import { loadAuthorizedSession, loadControlPlane } from "../../../lib/session";
import { createTenant } from "../control-plane-actions";

export default async function PlatformPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ created?: string; error?: string }> }>) {
  const [session, snapshot, status] = await Promise.all([
    loadAuthorizedSession(),
    loadControlPlane(),
    searchParams,
  ]);
  const canCreate = session?.permissions.includes("platform:tenants:write") ?? false;

  return (
    <main className="page control-page">
      <section className="control-hero">
        <div>
          <p className="eyebrow">OrbitOS master control</p>
          <h1>Company network</h1>
          <p>Provision complete, login-ready workspaces for companies that resell OrbitOS to their own customers.</p>
        </div>
        <div className="authority-badge"><span>Platform authority</span><strong>{snapshot === null ? "— companies" : `${snapshot.tenants.length} ${snapshot.tenants.length === 1 ? "company" : "companies"}`}</strong></div>
      </section>

      {status.created === "1" ? <p className="success-alert">Company workspace and first administrator created. The login is ready now.</p> : null}
      {status.error !== undefined ? <p className="form-error">The workspace could not be created. Check the slug, administrator email, and password.</p> : null}

      <section className="control-kpis" aria-label="Platform summary">
        <div><Buildings size={20} /><span>Companies</span><strong>{snapshot?.tenants.length ?? "—"}</strong></div>
        <div><UsersThree size={20} /><span>End customers</span><strong>{snapshot?.customers.length ?? "—"}</strong></div>
        <div><Globe size={20} /><span>Domain routes</span><strong>{snapshot?.domains.length ?? "—"}</strong></div>
      </section>

      <div className="control-split">
        <section className="control-panel">
          <div className="section-heading"><p className="eyebrow">Company inventory</p><h2>Reseller companies</h2></div>
          {snapshot === null ? (
            <div className="inline-alert"><strong>Control plane unavailable</strong>Company records could not be loaded.</div>
          ) : snapshot.tenants.length === 0 ? (
            <div className="empty-state"><strong>No reseller companies</strong><span>Create the first login-ready workspace.</span></div>
          ) : (
            <div className="tenant-stack">
              {snapshot.tenants.map((tenant) => {
                const customers = snapshot.customers.filter((item) => item.tenantId === tenant.tenantId).length;
                const users = snapshot.users.filter((item) => item.tenantId === tenant.tenantId).length;
                const domain = snapshot.domains.find((item) => item.tenantId === tenant.tenantId && item.kind === "platform_subdomain");
                return (
                  <article className="tenant-card" key={tenant.tenantId}>
                    <div><span className={`status-pill status-${tenant.status}`}>{tenant.status}</span><h3>{tenant.displayName}</h3><p>{domain?.hostname ?? `${tenant.slug}.orbitos.devlogix.com.pk`}</p></div>
                    <dl><div><dt>Customers</dt><dd>{customers}</dd></div><div><dt>Users</dt><dd>{users}</dd></div><div><dt>Workspace</dt><dd>{tenant.slug}</dd></div></dl>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="control-panel form-panel">
          <div className="section-heading"><p className="eyebrow">Provision</p><h2>New company workspace</h2></div>
          {canCreate ? (
            <form action={createTenant} className="configuration-form embedded-form">
              <label htmlFor="company-display-name">Company name</label>
              <input id="company-display-name" name="displayName" placeholder="Utopia Holdings" required />
              <label htmlFor="company-slug">Workspace slug</label>
              <div className="domain-input"><input id="company-slug" name="slug" pattern="[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?" placeholder="utopia" required /><span>.orbitos.devlogix.com.pk</span></div>
              <div className="form-divider"><span>First workspace administrator</span></div>
              <label htmlFor="administrator-display-name">Administrator name</label>
              <input id="administrator-display-name" name="administratorDisplayName" placeholder="Utopia Administrator" required />
              <label htmlFor="administrator-email">Administrator email</label>
              <input autoCapitalize="none" autoComplete="off" id="administrator-email" name="administratorEmail" placeholder="administrator@company.com" required spellCheck={false} type="email" />
              <label htmlFor="administrator-password">Temporary password</label>
              <input autoComplete="new-password" id="administrator-password" minLength={12} name="temporaryPassword" required type="password" />
              <p className="form-help">Workspace, route, and administrator login are committed together. If any step fails, nothing is created.</p>
              <PendingSubmitButton className="primary-button" pendingLabel="Creating workspace">Create workspace</PendingSubmitButton>
            </form>
          ) : <div className="inline-alert"><strong>Read-only platform view</strong>Your role cannot provision companies.</div>}
        </aside>
      </div>
    </main>
  );
}

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
          <h1>Tenant network</h1>
          <p>Provision and govern the companies that resell OrbitOS to their own customers, without crossing their operational data boundaries.</p>
        </div>
        <div className="authority-badge"><span>Platform authority</span><strong>{snapshot?.tenants.length ?? "—"} tenants</strong></div>
      </section>

      {status.created === "1" ? <p className="success-alert">Tenant created with a reserved OrbitOS subdomain.</p> : null}
      {status.error !== undefined ? <p className="form-error">The tenant could not be created. Check the slug and try again.</p> : null}

      <section className="control-kpis" aria-label="Platform summary">
        <div><Buildings size={20} /><span>Companies</span><strong>{snapshot?.tenants.length ?? "—"}</strong></div>
        <div><UsersThree size={20} /><span>End customers</span><strong>{snapshot?.customers.length ?? "—"}</strong></div>
        <div><Globe size={20} /><span>Domain routes</span><strong>{snapshot?.domains.length ?? "—"}</strong></div>
      </section>

      <div className="control-split">
        <section className="control-panel">
          <div className="section-heading"><p className="eyebrow">Company inventory</p><h2>Reseller tenants</h2></div>
          {snapshot === null ? (
            <div className="inline-alert"><strong>Control plane unavailable</strong>Tenant records could not be loaded.</div>
          ) : snapshot.tenants.length === 0 ? (
            <div className="empty-state"><strong>No reseller tenants</strong><span>Create the first company workspace.</span></div>
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
          <div className="section-heading"><p className="eyebrow">Provision</p><h2>New tenant</h2></div>
          {canCreate ? (
            <form action={createTenant} className="configuration-form embedded-form">
              <label htmlFor="tenant-display-name">Company name</label>
              <input id="tenant-display-name" name="displayName" placeholder="Albore Capital" required />
              <label htmlFor="tenant-slug">Workspace slug</label>
              <div className="domain-input"><input id="tenant-slug" name="slug" pattern="[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?" placeholder="albore" required /><span>.orbitos.devlogix.com.pk</span></div>
              <p className="form-help">The platform route is reserved immediately. DNS activation remains explicit and auditable.</p>
              <PendingSubmitButton className="primary-button" pendingLabel="Creating tenant">Create tenant</PendingSubmitButton>
            </form>
          ) : <div className="inline-alert"><strong>Read-only platform view</strong>Your role cannot provision companies.</div>}
        </aside>
      </div>
    </main>
  );
}

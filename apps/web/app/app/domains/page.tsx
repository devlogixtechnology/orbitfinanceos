import { CheckCircle, Globe, ShieldCheck } from "@phosphor-icons/react/dist/ssr";

import { PendingSubmitButton } from "../../../components/pending-submit-button";
import { loadAuthorizedSession, loadControlPlane } from "../../../lib/session";
import { createDomain } from "../control-plane-actions";

export default async function DomainsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ created?: string; error?: string }> }>) {
  const [session, snapshot, status] = await Promise.all([loadAuthorizedSession(), loadControlPlane(), searchParams]);
  const isPlatform = session?.roles.includes("super_admin") ?? false;
  const canWrite = session?.permissions.includes("domains:write") ?? false;
  const tenantName = new Map(snapshot?.tenants.map((tenant) => [tenant.tenantId, tenant.displayName]));

  return (
    <main className="page control-page">
      <header className="page-header control-heading"><p className="eyebrow">White-label routing</p><h1>Domains & workspace identity</h1><p>Each company receives an OrbitOS subdomain and can attach its own branded hostname after DNS ownership is verified.</p></header>
      {status.created === "1" ? <p className="success-alert">Domain route created. Complete the DNS verification record shown below.</p> : null}
      {status.error !== undefined ? <p className="form-error">The domain route could not be saved. Confirm the hostname is unique.</p> : null}

      <div className="control-split">
        <section className="control-panel">
          <div className="section-heading"><p className="eyebrow">Routing inventory</p><h2>Workspace domains</h2></div>
          {snapshot === null ? <div className="inline-alert">Domain inventory unavailable.</div> : snapshot.domains.length === 0 ? <div className="empty-state"><Globe size={26} /><strong>No domains configured</strong></div> : <div className="domain-stack">{snapshot.domains.map((domain) => <article className="domain-card" key={domain.domainId}><div className="domain-icon">{domain.status === "active" ? <CheckCircle size={20} weight="fill" /> : <Globe size={20} />}</div><div className="domain-main"><div><strong>{domain.hostname}</strong><span>{isPlatform ? tenantName.get(domain.tenantId) : domain.kind === "custom" ? "Custom domain" : "OrbitOS subdomain"}</span></div><span className={`status-pill status-${domain.status}`}>{domain.status.replaceAll("_", " ")}</span><div className="dns-instruction"><span>DNS ownership record</span><code>_orbitos.{domain.hostname} TXT orbitos-verification={domain.verificationToken}</code></div></div></article>)}</div>}
        </section>

        <aside className="control-panel form-panel">
          <div className="section-heading"><p className="eyebrow">Connect route</p><h2>Add domain</h2></div>
          {canWrite ? <form action={createDomain} className="configuration-form embedded-form">
            {isPlatform ? <><label htmlFor="domain-tenant">Tenant</label><select id="domain-tenant" name="tenantId" required><option value="">Select company</option>{snapshot?.tenants.map((tenant) => <option key={tenant.tenantId} value={tenant.tenantId}>{tenant.displayName}</option>)}</select></> : null}
            <label htmlFor="domain-hostname">Hostname</label><input id="domain-hostname" name="hostname" placeholder="finance.customer.com" required />
            <label htmlFor="domain-kind">Route type</label><select defaultValue="custom" id="domain-kind" name="kind"><option value="custom">Customer-owned domain</option>{isPlatform ? <option value="platform_subdomain">OrbitOS subdomain</option> : null}</select>
            <p className="form-help">Custom domains start in pending DNS state. TLS activation must follow successful ownership verification.</p>
            <PendingSubmitButton className="primary-button" pendingLabel="Adding domain">Add domain route</PendingSubmitButton>
          </form> : <div className="inline-alert"><strong>Read-only domain view</strong>Your role cannot change routing.</div>}
          <div className="security-note"><ShieldCheck size={20} /><div><strong>Fail-closed activation</strong><p>Traffic is never routed to an unverified hostname. Verification and certificate issuance are separate controlled steps.</p></div></div>
        </aside>
      </div>
    </main>
  );
}

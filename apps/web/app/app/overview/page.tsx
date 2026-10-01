import {
  ArrowRight,
  ArrowsLeftRight,
  CheckCircle,
  PlugsConnected,
  Scales,
  ShieldCheck,
  Storefront,
  Users,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import {
  loadAuthorizedSession,
  loadControlPlane,
  loadExceptions,
  loadIntegrations,
  loadMovements,
  loadReconciliations,
} from "../../../lib/session";

function countLabel(value: readonly unknown[] | null): string {
  return value === null ? "—" : String(value.length);
}

export default async function OverviewPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ customerId?: string }> }>) {
  const { customerId } = await searchParams;
  const [session, snapshot, integrations, allIntegrations, movements, reconciliations, allReconciliations, exceptions] = await Promise.all([
    loadAuthorizedSession(),
    loadControlPlane(),
    loadIntegrations(customerId),
    loadIntegrations(),
    loadMovements(),
    loadReconciliations(customerId),
    loadReconciliations(),
    loadExceptions(),
  ]);

  const isAdmin = session?.roles.includes("super_admin") || session?.roles.includes("tenant_admin");
  const customers = snapshot?.customers ?? [];
  const selectedCustomer = customerId ? customers.find((c) => c.customerId === customerId) : undefined;

  const hasUnavailableData = [integrations, movements, reconciliations, exceptions]
    .some((value) => value === null);
  const activeIntegrations = integrations?.filter((item) => item.enabled).length ?? 0;

  return (
    <main className="page">
      <section className="overview-hero">
        <header className="page-header overview-heading">
          <p className="eyebrow">{session?.tenant.displayName ?? "Company"} · Control Center</p>
          <h1>
            {selectedCustomer ? `${selectedCustomer.displayName} Overview` : `${session?.tenant.displayName ?? "Operational"} Overview`}
          </h1>
          <p>
            {selectedCustomer
              ? `Filtered portfolio and reconciled position telemetry for ${selectedCustomer.displayName} (${selectedCustomer.externalReference}).`
              : `A live company snapshot for ${session?.tenant.displayName ?? "OrbitOS"} from source configuration through evidence-backed reconciliation and exception resolution.`}
          </p>
        </header>
        <div className="control-posture">
          <div className="control-posture-icon"><ShieldCheck aria-hidden="true" size={24} weight="fill" /></div>
          <div>
            <span>Tenant Workspace</span>
            <strong>{session?.tenant.displayName ?? "Staging"}</strong>
          </div>
        </div>
      </section>

      {/* Admin Customer Filter Ribbon */}
      {isAdmin && customers.length > 0 ? (
        <section style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "10px",
          padding: "14px 20px",
          marginBottom: "24px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Users size={20} color="var(--color-accent)" />
            <strong style={{ fontSize: "0.88rem", color: "var(--color-text-primary)" }}>Customer View Scope:</strong>
            <span style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
              {selectedCustomer ? `Viewing ${selectedCustomer.displayName}` : "Viewing All Customers (Aggregate)"}
            </span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
            <Link
              href="/app/overview"
              className={!customerId ? "primary-button" : "secondary-button"}
              style={{ fontSize: "0.78rem", padding: "6px 12px", textDecoration: "none" }}
            >
              All Customers ({customers.length})
            </Link>
            {customers.map((c) => {
              const isSelected = c.customerId === customerId;
              return (
                <Link
                  key={c.customerId}
                  href={`/app/overview?customerId=${c.customerId}`}
                  className={isSelected ? "primary-button" : "secondary-button"}
                  style={{ fontSize: "0.78rem", padding: "6px 12px", textDecoration: "none" }}
                >
                  {c.displayName}
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {hasUnavailableData ? (
        <div className="inline-alert overview-alert" role="alert">
          <strong>Some operational data is temporarily unavailable</strong>
          Available counts remain visible. Refresh after the affected service recovers.
        </div>
      ) : null}

      <section aria-label="Current operational state" className="overview-metrics">
        <Link
          aria-label="View source inventory"
          className="metric-item"
          href={customerId ? `/app/integrations?customerId=${customerId}` : "/app/integrations"}
        >
          <span className="metric-icon"><PlugsConnected aria-hidden="true" size={20} /></span>
          <span className="metric-label">Integrations</span>
          <strong>{countLabel(integrations)}</strong>
          <small>{activeIntegrations} active source{activeIntegrations === 1 ? "" : "s"}</small>
        </Link>
        <Link aria-label="View normalized records" className="metric-item" href="/app/movements">
          <span className="metric-icon"><ArrowsLeftRight aria-hidden="true" size={20} /></span>
          <span className="metric-label">Movements</span>
          <strong>{countLabel(movements)}</strong>
          <small>Exact normalized records</small>
        </Link>
        <Link
          aria-label="View control results"
          className="metric-item"
          href={customerId ? `/app/reconciliation?customerId=${customerId}` : "/app/reconciliation"}
        >
          <span className="metric-icon analytic"><Scales aria-hidden="true" size={20} /></span>
          <span className="metric-label">Reconciliations</span>
          <strong>{countLabel(reconciliations)}</strong>
          <small>Governed position results</small>
        </Link>
        <Link aria-label="View work queue" className="metric-item" href="/app/exceptions">
          <span className="metric-icon warning"><WarningCircle aria-hidden="true" size={20} /></span>
          <span className="metric-label">Exceptions</span>
          <strong>{countLabel(exceptions)}</strong>
          <small>Items in the work queue</small>
        </Link>
      </section>

      {/* Admin Customer-Wise Portfolio Breakdown */}
      {isAdmin && customers.length > 0 ? (
        <section style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "28px",
        }}>
          <div className="section-heading" style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p className="eyebrow">Customer Breakdown</p>
              <h2 style={{ fontSize: "1.25rem", margin: "2px 0 0" }}>Customer-Wise Telemetry &amp; Integrations</h2>
            </div>
            <Link href="/app/customers" className="secondary-button" style={{ fontSize: "0.8rem", padding: "6px 12px" }}>
              Manage Customers <ArrowRight size={14} style={{ marginLeft: "4px" }} />
            </Link>
          </div>

          <div className="table-scroll">
            <table className="control-table">
              <thead>
                <tr>
                  <th>Customer Workspace</th>
                  <th>Reference</th>
                  <th>Login Email</th>
                  <th>Sources / Integrations</th>
                  <th>Reconciliations</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const custIntegrations = allIntegrations?.filter((i) => i.customerId === c.customerId) ?? [];
                  const custReconciliations = allReconciliations?.filter((r) => r.customerId === c.customerId) ?? [];
                  const isSelected = c.customerId === customerId;

                  return (
                    <tr key={c.customerId} style={isSelected ? { background: "var(--color-accent-soft)" } : {}}>
                      <td>
                        <strong>{c.displayName}</strong>
                        <span className="table-subline">Created {new Date(c.createdAt).toLocaleDateString()}</span>
                      </td>
                      <td className="mono-value">{c.externalReference}</td>
                      <td>{c.email ? <span style={{ color: "var(--color-text-primary)" }}>{c.email}</span> : <span className="muted-copy">—</span>}</td>
                      <td>
                        <strong>{custIntegrations.length}</strong> source{custIntegrations.length === 1 ? "" : "s"}
                        <span className="table-subline">{custIntegrations.filter((i) => i.enabled).length} active</span>
                      </td>
                      <td>
                        <strong>{custReconciliations.length}</strong> completed
                        <span className="table-subline">
                          {custReconciliations.filter((r) => r.state === "matched").length} in balance
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill status-${c.status}`}>{c.status}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <Link
                            href={`/app/overview?customerId=${c.customerId}`}
                            className="secondary-button"
                            style={{ fontSize: "0.74rem", padding: "4px 8px" }}
                          >
                            Filter Overview
                          </Link>
                          <Link
                            href={`/app/integrations?customerId=${c.customerId}`}
                            className="secondary-button"
                            style={{ fontSize: "0.74rem", padding: "4px 8px" }}
                          >
                            Sources
                          </Link>
                          <Link
                            href={`/app/reconciliation?customerId=${c.customerId}`}
                            className="secondary-button"
                            style={{ fontSize: "0.74rem", padding: "4px 8px" }}
                          >
                            Reconcile
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="overview-grid">
        <div className="overview-panel">
          <div className="section-heading overview-section-heading">
            <div><p className="eyebrow">Governed workflow</p><h2>From source to control result</h2></div>
            <CheckCircle aria-hidden="true" color="var(--color-success)" size={22} weight="fill" />
          </div>
          <ol className="workflow-steps">
            <li><span>01</span><div><strong>Connect a read-only source</strong><p>Approve wallet, token, network scanners, and Fireblocks API scope.</p></div></li>
            <li><span>02</span><div><strong>Preserve and verify evidence</strong><p>Normalize exact movements and trace transactions against 22+ network scanners.</p></div></li>
            <li><span>03</span><div><strong>Reconcile and resolve</strong><p>Roll verified facts forward, detect inter-wallet transfers, and report As-At balances.</p></div></li>
          </ol>
        </div>

        <aside className="next-action-panel">
          <p className="eyebrow">Recommended next action</p>
          <h2>{integrations !== null && integrations.length > 0 ? "Review source activity" : "Configure the first source"}</h2>
          <p>
            {integrations !== null && integrations.length > 0
              ? "Open the integration inventory to review scope, run history, and checkpoints."
              : "Add an allowlisted wallet or blockchain scanner API. OrbitOS never requests a signing key."}
          </p>
          <Link className="empty-action" href={customerId ? `/app/integrations?customerId=${customerId}` : "/app/integrations"}>
            {integrations !== null && integrations.length > 0 ? "Open integrations" : "Configure integration"}
            <ArrowRight aria-hidden="true" size={16} weight="bold" />
          </Link>
          <div className="boundary-note"><ShieldCheck aria-hidden="true" size={18} /><span>No custody, signing, or chain-write capability.</span></div>
        </aside>
      </section>
    </main>
  );
}


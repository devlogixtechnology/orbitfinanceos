import {
  ArrowRight,
  ArrowsLeftRight,
  CheckCircle,
  PlugsConnected,
  Scales,
  ShieldCheck,
  Storefront,
  Users,
  Vault,
  Wallet,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import {
  loadAuthorizedSession,
  loadControlPlane,
  loadExceptions,
  loadFireblocksWallets,
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
  const session = await loadAuthorizedSession();
  const isCustomer = Boolean(session?.actor.customerId);
  const activeCustomerId = session?.actor.customerId ?? customerId;
  const effectiveCompany = session?.actor.customerDisplayName ?? session?.tenant.displayName ?? "Company";

  const [snapshot, integrations, allIntegrations, movements, reconciliations, allReconciliations, exceptions, wallets] = await Promise.all([
    !isCustomer ? loadControlPlane() : Promise.resolve(null),
    loadIntegrations(activeCustomerId),
    !isCustomer ? loadIntegrations() : Promise.resolve(null),
    loadMovements(),
    loadReconciliations(activeCustomerId),
    !isCustomer ? loadReconciliations() : Promise.resolve(null),
    loadExceptions(),
    loadFireblocksWallets(activeCustomerId),
  ]);

  const isAdmin = !isCustomer && (session?.roles.includes("super_admin") || session?.roles.includes("tenant_admin"));
  const customers = snapshot?.customers ?? [];
  const selectedCustomer = activeCustomerId ? customers.find((c) => c.customerId === activeCustomerId) : undefined;

  const hasUnavailableData = [integrations, movements, reconciliations, exceptions]
    .some((value) => value === null);
  const activeIntegrations = integrations?.filter((item) => item.enabled).length ?? 0;

  return (
    <main className="page">
      <section className="overview-hero">
        <header className="page-header overview-heading">
          <p className="eyebrow">{effectiveCompany} · {isCustomer ? "Client Workspace" : "Control Center"}</p>
          <h1>
            {isCustomer ? `${effectiveCompany} Dashboard` : selectedCustomer ? `${selectedCustomer.displayName} Overview` : `${effectiveCompany} Overview`}
          </h1>
          <p>
            {isCustomer
              ? `Real-time custody portfolio, connected wallets, and dual-party financial verification for ${effectiveCompany}.`
              : selectedCustomer
                ? `Filtered portfolio and reconciled position telemetry for ${selectedCustomer.displayName} (${selectedCustomer.externalReference}).`
                : `A live company snapshot for ${effectiveCompany} from source configuration through evidence-backed reconciliation and exception resolution.`}
          </p>
        </header>
        <div className="control-posture">
          <div className="control-posture-icon"><ShieldCheck aria-hidden="true" size={24} weight="fill" /></div>
          <div>
            <span>{isCustomer ? "Company Workspace" : "Operational Status"}</span>
            <strong>{effectiveCompany}</strong>
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

      {/* Custody Wallets & Balances */}
      <section className="control-panel" style={{ marginBottom: "28px" }}>
        <div className="section-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <p className="eyebrow">{isCustomer ? "Connected Custody" : "Custody & Asset Telemetry"}</p>
            <h2><Vault size={22} style={{ verticalAlign: "middle", marginRight: "8px", color: "var(--color-accent)" }} />Connected Wallets &amp; Live Balances</h2>
            <p>Live wallet addresses, asset balances, and as-at timestamps synced from Fireblocks and registered company wallets.</p>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <Link href={activeCustomerId ? `/app/integrations?customerId=${activeCustomerId}` : "/app/integrations"} className="secondary-button" style={{ fontSize: "13px", padding: "6px 12px" }}>
              Manage Sources
            </Link>
            <Link href={activeCustomerId ? `/app/reconciliation?customerId=${activeCustomerId}` : "/app/reconciliation"} className="primary-button" style={{ fontSize: "13px", padding: "6px 12px" }}>
              Reconciliation
            </Link>
          </div>
        </div>

        {wallets === null || wallets.length === 0 ? (
          <div className="empty-state" style={{ padding: "32px 20px" }}>
            <Wallet size={32} style={{ opacity: 0.5, marginBottom: "8px" }} />
            <strong>No custody wallets linked yet</strong>
            <p style={{ maxWidth: "460px", margin: "6px auto 16px", fontSize: "13px", color: "var(--color-text-secondary)" }}>
              Connect your Fireblocks API in Integrations or import a CSV statement to track live balances and automatic roll-forwards.
            </p>
            <Link href={activeCustomerId ? `/app/integrations?customerId=${activeCustomerId}` : "/app/integrations"} className="secondary-button" style={{ fontSize: "13px" }}>
              Connect Fireblocks Custody
            </Link>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="control-table">
              <thead>
                <tr>
                  <th>Vault / Wallet</th>
                  <th>Address</th>
                  <th>Asset</th>
                  <th>As Of</th>
                  <th>Live Balance</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {wallets.map((w) => (
                  <tr key={`${w.vaultAccountId}-${w.walletAddress}-${w.assetId}`}>
                    <td>
                      <strong>{w.vaultAccountName || w.vaultAccountId}</strong>
                      <span className="table-subline mono-value">Vault: {w.vaultAccountId}</span>
                    </td>
                    <td className="mono-value" style={{ fontSize: "12px" }}>
                      {w.walletAddress.length > 24
                        ? `${w.walletAddress.slice(0, 10)}…${w.walletAddress.slice(-8)}`
                        : w.walletAddress}
                    </td>
                    <td>
                      <strong>{w.assetId.includes("native") ? "BNB" : w.assetId.split(":").pop()?.toUpperCase() ?? w.assetId}</strong>
                      <span className="table-subline mono-value">{w.assetId}</span>
                    </td>
                    <td style={{ fontSize: "12px", whiteSpace: "nowrap" }}>
                      {new Date(w.asAt).toLocaleString()}
                    </td>
                    <td>
                      <strong style={{ fontSize: "14px", color: "var(--color-text-primary)" }}>{w.totalBalance}</strong>
                      {w.pendingBalance !== "0" ? (
                        <span className="table-subline" style={{ color: "var(--color-warning)" }}>Pending: {w.pendingBalance}</span>
                      ) : null}
                    </td>
                    <td>
                      <Link
                        href={activeCustomerId ? `/app/reconciliation?customerId=${activeCustomerId}` : "/app/reconciliation"}
                        className="secondary-button"
                        style={{ fontSize: "12px", padding: "4px 8px" }}
                      >
                        Reconcile
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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


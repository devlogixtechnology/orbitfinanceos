import {
  ArrowsClockwise,
  CheckCircle,
  DownloadSimple,
  FileCsv,
  Gear,
  ShieldCheck,
  Trash,
  Vault,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { PendingSubmitButton } from "../../../components/pending-submit-button";
import {
  loadAuthorizedSession,
  loadControlPlane,
  loadCsvImports,
  loadDataConnections,
  loadFireblocksWallets,
  loadReconciliations,
} from "../../../lib/session";
import { deleteCsvImportAction } from "../integrations/actions";
import {
  pushToQuickBooksAction,
  reconcileCsvImport,
  reconcileFireblocksWallet,
  runReconciliation,
} from "./actions";

export default async function ReconciliationPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ customerId?: string; deleted?: string; error?: string; qbSynced?: string; reconciled?: string }>;
}>) {
  const status = await searchParams;
  const session = await loadAuthorizedSession();
  const isCustomer = Boolean(session?.actor.customerId);
  const activeCustomerId = session?.actor.customerId ?? status.customerId;

  const [snapshot, results, wallets, connections, csvImports] = await Promise.all([
    !isCustomer ? loadControlPlane() : Promise.resolve(null),
    loadReconciliations(activeCustomerId),
    loadFireblocksWallets(activeCustomerId),
    loadDataConnections(activeCustomerId),
    loadCsvImports(activeCustomerId),
  ]);

  const customerNameMap = new Map(snapshot?.customers.map((c) => [c.customerId, c.displayName]) ?? []);
  const hasFireblocks = connections?.some((conn) => conn.provider === "fireblocks" && conn.status === "configured");

  return (
    <main className="page">
      <header className="page-header">
        <p className="eyebrow">{isCustomer ? "Customer Dashboard" : "Dual-Party Financial Verification"}</p>
        <h1>Reconciliation</h1>
        <p>
          {isCustomer
            ? "Reconcile live Fireblocks custody vault balances and uploaded CSV records against independently verified blockchain facts."
            : "Live Fireblocks vault balances, CSV statement imports, and atomic roll-forwards visible to both operators and customers."}
        </p>
      </header>

      {status.reconciled === "1" ? (
        <p className="success-alert" role="status">
          Reconciliation completed successfully. Validation results and difference calculations updated below.
        </p>
      ) : null}
      {status.qbSynced === "1" ? (
        <p className="success-alert" role="status">
          Reconciliation journal entry successfully synced and recorded to QuickBooks Online.
        </p>
      ) : null}
      {status.deleted === "1" ? (
        <p className="success-alert" role="status">
          CSV statement removed successfully.
        </p>
      ) : null}
      {status.error !== undefined ? (
        <p className="form-error" role="alert">
          {status.error === "csv-empty"
            ? "CSV REJECTED: The uploaded CSV file contains no valid transactions or data rows. Real data is required."
            : status.error === "delete-failed"
              ? "Failed to remove CSV statement."
              : status.error === "qb-sync-failed"
                ? "Failed to push reconciliation to QuickBooks. Ensure a valid QuickBooks connection exists."
                : status.error === "fireblocks-reconciliation-failed"
                  ? "Fireblocks live reconciliation failed. Ensure the wallet address is active in Fireblocks."
                  : status.error === "csv-reconciliation-failed"
                    ? "CSV reconciliation could not be processed. Verify the file records."
                    : status.error === "csv-invalid"
                      ? "Invalid CSV import reference."
                      : "Reconciliation run encountered an error."}
        </p>
      ) : null}

      <div style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "10px",
        padding: "16px 20px",
        marginBottom: "24px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "14px",
      }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <span style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)", fontWeight: 800, padding: "2px 8px", borderRadius: "4px", fontSize: "0.75rem" }}>01</span>
          <div>
            <strong style={{ fontSize: "0.82rem", display: "block", color: "var(--color-text-primary)" }}>Wallet Discovery</strong>
            <span style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)" }}>Auto-detects source and destination addresses</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <span style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)", fontWeight: 800, padding: "2px 8px", borderRadius: "4px", fontSize: "0.75rem" }}>02</span>
          <div>
            <strong style={{ fontSize: "0.82rem", display: "block", color: "var(--color-text-primary)" }}>Inflows &amp; Outflows</strong>
            <span style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)" }}>Calculates gross atomic credits and debits</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <span style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)", fontWeight: 800, padding: "2px 8px", borderRadius: "4px", fontSize: "0.75rem" }}>03</span>
          <div>
            <strong style={{ fontSize: "0.82rem", display: "block", color: "var(--color-text-primary)" }}>Inter-Wallet Isolation</strong>
            <span style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)" }}>Flags internal transfers between company wallets</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <span style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)", fontWeight: 800, padding: "2px 8px", borderRadius: "4px", fontSize: "0.75rem" }}>04</span>
          <div>
            <strong style={{ fontSize: "0.82rem", display: "block", color: "var(--color-text-primary)" }}>On-Chain Verification</strong>
            <span style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)" }}>Traces txHashes against 22+ network scanners</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <span style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)", fontWeight: 800, padding: "2px 8px", borderRadius: "4px", fontSize: "0.75rem" }}>05</span>
          <div>
            <strong style={{ fontSize: "0.82rem", display: "block", color: "var(--color-text-primary)" }}>As-At Position Balance</strong>
            <span style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)" }}>Opening + Inflows − Outflows audit result</span>
          </div>
        </div>
      </div>

      {!isCustomer && snapshot?.customers && snapshot.customers.length > 0 ? (
        <div className="control-panel" style={{ marginBottom: "24px", padding: "16px 20px" }}>
          <form method="GET" style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <label htmlFor="recon-customer-filter" style={{ fontWeight: 600, fontSize: "13px" }}>
              Filter by Customer:
            </label>
            <select
              id="recon-customer-filter"
              name="customerId"
              defaultValue={status.customerId ?? ""}
              style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--color-border-strong)" }}
            >
              <option value="">All Customers (Workspace Overview)</option>
              {snapshot.customers.map((cust) => (
                <option key={cust.customerId} value={cust.customerId}>
                  {cust.displayName} ({cust.externalReference})
                </option>
              ))}
            </select>
            <button type="submit" className="secondary-button" style={{ padding: "6px 14px" }}>
              Filter
            </button>
            {status.customerId ? (
              <Link href="/app/reconciliation" className="muted-copy" style={{ fontSize: "13px", marginLeft: "8px" }}>
                Clear filter
              </Link>
            ) : null}
          </form>
        </div>
      ) : null}

      <section className="control-panel" style={{ marginBottom: "24px" }}>
        <div className="section-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p className="eyebrow">Live Custody Integration</p>
            <h2><Vault size={20} style={{ verticalAlign: "middle", marginRight: "8px" }} />Fireblocks Live Vault Wallets</h2>
            <p>Real-time as-at balances from Fireblocks custody vaults ready for immediate ledger verification.</p>
          </div>
          {!hasFireblocks ? (
            <Link href="/app/integrations" className="secondary-button" style={{ padding: "6px 12px", fontSize: "13px" }}>
              Connect Fireblocks
            </Link>
          ) : null}
        </div>

        {!hasFireblocks ? (
          <div className="inline-alert">
            <strong>Fireblocks not configured</strong>
            <span>
              {" "}To display live vault accounts and as-at balances, configure Fireblocks under{" "}
              <Link href="/app/integrations" style={{ textDecoration: "underline", fontWeight: 600 }}>
                Integrations
              </Link>
              .
            </span>
          </div>
        ) : wallets === null || wallets.length === 0 ? (
          <div className="empty-state">
            <Vault size={26} />
            <strong>No Fireblocks vault wallets found</strong>
            <span>Verify the API credentials and workspace ID configured for Fireblocks.</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="control-table">
              <thead>
                <tr>
                  <th>Vault Account</th>
                  <th>Wallet Address</th>
                  <th>Asset</th>
                  <th>As-At Time</th>
                  <th>Total Balance (Atomic)</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {wallets.map((wallet) => (
                  <tr key={`${wallet.vaultAccountId}-${wallet.walletAddress}-${wallet.assetId}`}>
                    <td>
                      <strong>{wallet.vaultAccountName}</strong>
                      <span className="table-subline mono-value">{wallet.vaultAccountId}</span>
                      {wallet.customerId && customerNameMap.has(wallet.customerId) ? (
                        <span className="status-badge" style={{ marginTop: "4px" }}>
                          {customerNameMap.get(wallet.customerId)}
                        </span>
                      ) : null}
                    </td>
                    <td className="mono-value">{wallet.walletAddress}</td>
                    <td>
                      <strong>{wallet.assetId.includes("native") ? "BNB (Native)" : wallet.assetId.split(":").pop()?.slice(0, 10) + "…"}</strong>
                      <span className="table-subline mono-value">{wallet.assetId}</span>
                    </td>
                    <td style={{ fontSize: "12px" }}>{new Date(wallet.asAt).toLocaleString()}</td>
                    <td className="mono-value">
                      <strong>{wallet.totalBalance}</strong>
                      {wallet.pendingBalance !== "0" ? (
                        <span className="table-subline">Pending: {wallet.pendingBalance}</span>
                      ) : null}
                    </td>
                    <td>
                      <form action={reconcileFireblocksWallet} style={{ margin: 0 }}>
                        <input name="walletAddress" type="hidden" value={wallet.walletAddress} />
                        <input name="assetId" type="hidden" value={wallet.assetId} />
                        {wallet.customerId ? <input name="customerId" type="hidden" value={wallet.customerId} /> : null}
                        <input name="cutoff" type="hidden" value={wallet.asAt} />
                        <PendingSubmitButton className="primary-button" pendingLabel="Reconciling live...">
                          <ArrowsClockwise size={16} />
                          Reconcile Live Balance
                        </PendingSubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="control-panel" style={{ marginBottom: "24px" }}>
        <div className="section-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p className="eyebrow">Statement Ingestion</p>
            <h2><FileCsv size={20} style={{ verticalAlign: "middle", marginRight: "8px" }} />CSV Upload Reconciliations</h2>
            <p>Uploaded CSV files preserved with SHA-256 evidence digests. Run reconciliation on demand.</p>
          </div>
          <Link href="/app/integrations" className="secondary-button" style={{ padding: "6px 12px", fontSize: "13px" }}>
            Upload new CSV
          </Link>
        </div>

        {csvImports === null || csvImports.length === 0 ? (
          <div className="empty-state">
            <FileCsv size={26} />
            <strong>No CSV imports yet</strong>
            <span>Upload position balances or transaction statements in CSV format to trigger reconciliation.</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="control-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  {snapshot?.customers ? <th>Customer</th> : null}
                  <th>Rows</th>
                  <th>Preserved At</th>
                  <th>Digest</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {csvImports.map((imp) => (
                  <tr key={imp.importId}>
                    <td>
                      <strong>{imp.fileName}</strong>
                      <span className="table-subline mono-value">{imp.importId.slice(0, 18)}…</span>
                    </td>
                    {snapshot?.customers ? (
                      <td>
                        {imp.customerId && customerNameMap.has(imp.customerId) ? (
                          <span className="status-badge">{customerNameMap.get(imp.customerId)}</span>
                        ) : (
                          <span className="muted-copy">Tenant-wide</span>
                        )}
                      </td>
                    ) : null}
                    <td>{Number(imp.rowCount).toLocaleString()} rows</td>
                    <td style={{ fontSize: "12px" }}>{new Date(imp.createdAt).toLocaleString()}</td>
                    <td className="mono-value" title={imp.sha256}>
                      {imp.sha256.slice(0, 16)}…
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <form action={reconcileCsvImport} style={{ margin: 0 }}>
                          <input name="importId" type="hidden" value={imp.importId} />
                          {imp.customerId ? <input name="customerId" type="hidden" value={imp.customerId} /> : null}
                          <PendingSubmitButton className="secondary-button" pendingLabel="Reconciling...">
                            Reconcile CSV Data
                          </PendingSubmitButton>
                        </form>
                        <form action={deleteCsvImportAction} style={{ margin: 0 }}>
                          <input name="importId" type="hidden" value={imp.importId} />
                          <input name="returnTo" type="hidden" value="/app/reconciliation" />
                          <button
                            className="ghost-button destructive-button"
                            style={{ padding: "6px 10px" }}
                            type="submit"
                            title="Delete CSV statement"
                          >
                            <Trash size={16} />
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="control-panel" style={{ marginBottom: "24px" }}>
        <div className="section-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <p className="eyebrow">Auditable Ledger State</p>
            <h2>Validation &amp; Reconciliation Results</h2>
            <p>
              Independent validation comparing observed custody/CSV quantities against expected closing balances derived from verified ledger facts.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <a
              href={`/api/export-reconciliations${activeCustomerId ? `?customerId=${activeCustomerId}` : ""}`}
              className="secondary-button"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", textDecoration: "none", fontSize: "13px" }}
            >
              <DownloadSimple size={16} />
              Export CSV
            </a>
            <Link
              href="/app/settings"
              className="ghost-button"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", textDecoration: "none", fontSize: "13px" }}
            >
              <Gear size={16} />
              Automation Settings
            </Link>
          </div>
        </div>

        {results === null ? (
          <div className="inline-alert" role="alert">
            <strong>Reconciliation unavailable</strong>
            OrbitOS could not load control results.
          </div>
        ) : results.length === 0 ? (
          <div className="empty-state">
            <ShieldCheck size={26} />
            <strong>No reconciliation results yet</strong>
            <span>Run a live Fireblocks reconciliation or CSV reconciliation above to see validation results.</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="control-table">
              <thead>
                <tr>
                  <th>Cutoff</th>
                  {snapshot?.customers ? <th>Customer</th> : null}
                  <th>Wallet Address / Asset</th>
                  <th>Expected Closing</th>
                  <th>Observed Balance</th>
                  <th>Difference</th>
                  <th>State &amp; Validation</th>
                  <th>Exceptions</th>
                  <th>QuickBooks Sync</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => {
                  const isMatched = result.state === "matched";
                  return (
                    <tr key={result.reconciliationId}>
                      <td>
                        <Link href={`/app/reconciliation/${result.reconciliationId}`} style={{ fontWeight: 600 }}>
                          {new Date(result.cutoff).toLocaleString()}
                        </Link>
                      </td>
                      {snapshot?.customers ? (
                        <td>
                          {result.customerId && customerNameMap.has(result.customerId) ? (
                            <span className="status-badge">{customerNameMap.get(result.customerId)}</span>
                          ) : (
                            <span className="muted-copy">Tenant-wide</span>
                          )}
                        </td>
                      ) : null}
                      <td>
                        <span className="mono-value" style={{ display: "block" }}>{result.walletAddress}</span>
                        <span className="table-subline mono-value">{result.assetId}</span>
                      </td>
                      <td className="mono-value">{result.expectedClosingQuantityAtomic}</td>
                      <td className="mono-value">{result.observedClosingQuantityAtomic ?? "Not observed"}</td>
                      <td className="mono-value">
                        {result.differenceAtomic ? (
                          <span style={{ color: result.differenceAtomic === "0" ? "var(--color-success)" : "var(--color-error)", fontWeight: 600 }}>
                            {result.differenceAtomic}
                          </span>
                        ) : (
                          "0"
                        )}
                      </td>
                      <td>
                        <span className={`status-pill status-${isMatched ? "active" : "error"}`} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          {isMatched ? <CheckCircle size={14} /> : <WarningCircle size={14} />}
                          {result.state.replace("_", " ")}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${result.exceptionCount === "0" ? "" : "status-error"}`}>
                          {result.exceptionCount} {result.exceptionCount === "1" ? "issue" : "issues"}
                        </span>
                      </td>
                      <td>
                        <form action={pushToQuickBooksAction} style={{ margin: 0 }}>
                          <input name="reconciliationId" type="hidden" value={result.reconciliationId} />
                          <PendingSubmitButton
                            className="secondary-button"
                            style={{ padding: "4px 10px", fontSize: "12px", whiteSpace: "nowrap" }}
                            pendingLabel="Pushing..."
                          >
                            Push to QB
                          </PendingSubmitButton>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <details className="detail-panel">
        <summary>Run custom ad-hoc position reconciliation</summary>
        <form action={runReconciliation} className="configuration-form workflow-form">
          {!isCustomer && snapshot?.customers && snapshot.customers.length > 0 ? (
            <>
              <label htmlFor="adhoc-customer">Customer (Optional)</label>
              <select id="adhoc-customer" name="customerId" defaultValue={activeCustomerId ?? ""}>
                <option value="">Tenant-wide (Default)</option>
                {snapshot.customers.map((c) => (
                  <option key={c.customerId} value={c.customerId}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <label htmlFor="reconciliation-wallet">Wallet address</label>
          <input defaultValue="0x28a1c8942b00508a546d0a42426027a0033d5964" id="reconciliation-wallet" name="walletAddress" required />
          <label htmlFor="reconciliation-asset">Asset ID</label>
          <input defaultValue="bsc:56:native" id="reconciliation-asset" name="assetId" placeholder="bsc:56:0x… or bsc:56:native" required />
          <label htmlFor="reconciliation-cutoff">Cutoff (UTC)</label>
          <input defaultValue={new Date().toISOString()} id="reconciliation-cutoff" name="cutoff" placeholder="2026-09-29T23:59:59.000Z" required />
          <label htmlFor="reconciliation-opening">Opening atomic quantity</label>
          <input defaultValue="0" id="reconciliation-opening" name="openingQuantityAtomic" pattern="-?(0|[1-9][0-9]*)" required />
          <label htmlFor="reconciliation-observed">Observed closing atomic quantity (optional)</label>
          <input defaultValue="2500000000000000000" id="reconciliation-observed" name="observedClosingQuantityAtomic" pattern="-?(0|[1-9][0-9]*)" />
          <input name="policyVersion" type="hidden" value="bsc-v1" />
          <PendingSubmitButton className="primary-button" pendingLabel="Reconciling">
            Run reconciliation
          </PendingSubmitButton>
        </form>
      </details>
    </main>
  );
}

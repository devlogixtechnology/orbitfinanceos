import { Broadcast, CloudArrowUp, FileCsv, PlugsConnected, Vault, Wallet } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { PendingSubmitButton } from "../../../components/pending-submit-button";
import {
  loadAuthorizedSession,
  loadControlPlane,
  loadCsvImports,
  loadDataConnections,
  loadIngestionRuns,
  loadIntegrations,
  loadSupportedScanners,
} from "../../../lib/session";
import {
  configureDataConnection,
  controlIngestionRun,
  createIntegration,
  reconcileCsvImport,
  setIntegrationEnabled,
  startIngestion,
  updateIntegrationConfiguration,
  uploadCsvImport,
} from "./actions";
import { ScannerConfigForm } from "./scanner-config-form";
import { WalletConfigForm } from "./wallet-config-form";

export default async function IntegrationsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{
    customerId?: string;
    connected?: string;
    created?: string;
    error?: string;
    imported?: string;
    run?: string;
    updated?: string;
  }>;
}>) {
  const status = await searchParams;
  const session = await loadAuthorizedSession();
  const isCustomer = Boolean(session?.actor.customerId);
  const activeCustomerId = session?.actor.customerId ?? status.customerId;

  const [snapshot, integrations, runs, connections, csvImports, supportedScanners] = await Promise.all([
    !isCustomer ? loadControlPlane() : Promise.resolve(null),
    loadIntegrations(activeCustomerId),
    loadIngestionRuns(),
    loadDataConnections(activeCustomerId),
    loadCsvImports(activeCustomerId),
    loadSupportedScanners(),
  ]);

  const customerNameMap = new Map(snapshot?.customers.map((c) => [c.customerId, c.displayName]) ?? []);

  return (
    <main className="page">
      <header className="page-header">
        <p className="eyebrow">{isCustomer ? "Customer Dashboard" : "Operational Integrations"}</p>
        <h1>Integrations</h1>
        <p>
          {isCustomer
            ? "Connect your Fireblocks custody, link QuickBooks accounting, and manage blockchain data sources for your workspace."
            : "Bring accounting, custody, spreadsheet, and blockchain sources into one evidence-backed workspace with customer-level isolation."}
        </p>
      </header>

      {isCustomer ? (
        <div className="inline-alert" style={{ marginBottom: "24px" }} role="status">
          <strong>Customer Workspace Mode:</strong> You are managing customer-specific integrations. Any Fireblocks custody or QuickBooks connections configured here remain strictly scoped to your organization.
        </div>
      ) : snapshot?.customers && snapshot.customers.length > 0 ? (
        <div className="control-panel" style={{ marginBottom: "24px", padding: "16px 20px" }}>
          <form method="GET" style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <label htmlFor="customer-filter-select" style={{ fontWeight: 600, fontSize: "13px" }}>
              Filter by Customer:
            </label>
            <select
              id="customer-filter-select"
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
              Apply Filter
            </button>
            {status.customerId ? (
              <Link href="/app/integrations" className="muted-copy" style={{ fontSize: "13px", marginLeft: "8px" }}>
                Clear filter
              </Link>
            ) : null}
          </form>
        </div>
      ) : null}

      {status.connected === "1" ? (
        <p className="success-alert" role="status">
          Secure connection references saved. No provider credential was stored in the application database.
        </p>
      ) : null}
      {status.connected === "scanner" ? (
        <p className="success-alert" role="status">
          Blockchain network scanner source configured successfully. Transactions will be traced and verified against on-chain confirmations.
        </p>
      ) : null}
      {status.connected === "wallet" ? (
        <p className="success-alert" role="status">
          Company internal wallet registered successfully. Inter-wallet transfers between company wallets will be identified and isolated during reconciliation.
        </p>
      ) : null}
      {status.imported === "1" ? (
        <p className="success-alert" role="status">
          CSV validated and preserved as immutable source evidence.
        </p>
      ) : null}
      {status.created === "1" ? (
        <p className="success-alert" role="status">
          Integration created inside this company workspace.
        </p>
      ) : null}
      {status.updated === "1" ? (
        <p className="success-alert" role="status">
          Operator action saved inside this company workspace.
        </p>
      ) : null}
      {status.run === "1" ? (
        <p className="success-alert" role="status">
          Bounded ingestion finished. Review the run and normalized movements.
        </p>
      ) : null}
      {status.error !== undefined ? (
        <p className="form-error" role="alert">
          {status.error === "csv-invalid"
            ? "Choose a valid UTF-8 CSV under 100 MB with a header and at least one data row."
            : status.error === "csv-empty"
              ? "CSV REJECTED: The uploaded CSV contains no readable transactions or data rows. Real data is required."
              : status.error === "wallet-invalid"
                ? "Invalid wallet address: EVM wallet address must start with 0x and be a valid hex address."
                : status.error === "csv-unavailable"
                  ? "The CSV could not be preserved. No partial import was created."
                  : status.error === "connection-invalid"
                    ? "Check the connection identifiers and vault reference."
                    : status.error === "connection-unavailable"
                      ? "The secure connection references could not be saved."
                      : status.error === "reconciliation-failed"
                        ? "CSV reconciliation could not be initiated. Verify the file format."
                        : status.error === "invalid"
                          ? "Check the chain, block number, wallet, and token contract values."
                          : status.error === "run"
                            ? "The bounded run could not complete. Its checkpoint and quarantine state were preserved."
                            : "The integration could not be saved. Please try again."}
        </p>
      ) : null}

      <section aria-labelledby="source-catalog-heading" className="source-catalog">
        <div className="section-heading source-catalog-heading">
          <p className="eyebrow">Connect data</p>
          <h2 id="source-catalog-heading">Choose a source</h2>
          <p>
            Every action validates first, shows progress immediately, and either completes fully or leaves no partial configuration.
          </p>
        </div>

        <div className="source-card-grid">
          <article className="source-card source-card-ready">
            <div className="source-card-head">
              <span className="source-icon"><FileCsv size={22} /></span>
              <span className="status-pill status-active">Ready</span>
            </div>
            <div>
              <p className="eyebrow">File import</p>
              <h3>CSV upload &amp; Reconcile</h3>
              <p>Preserve the original file with a SHA-256 digest, record row count, and trigger reconciliation.</p>
            </div>
            <form action={uploadCsvImport} className="source-connect-form">
              {!isCustomer && snapshot?.customers && snapshot.customers.length > 0 ? (
                <>
                  <label htmlFor="csv-customer">Customer (Optional)</label>
                  <select id="csv-customer" name="customerId" defaultValue={activeCustomerId ?? ""}>
                    <option value="">Tenant-wide (Default)</option>
                    {snapshot.customers.map((c) => (
                      <option key={c.customerId} value={c.customerId}>
                        {c.displayName}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              <label htmlFor="csv-file">CSV file</label>
              <input accept=".csv,text/csv" id="csv-file" name="csvFile" required type="file" />
              <span className="form-help">High-Scale RFC-4180 Parser · Fireblocks export support · Up to 100 MB / 500,000 rows</span>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", margin: "8px 0" }}>
                <input defaultChecked name="startReconciliation" type="checkbox" value="true" />
                <span style={{ fontSize: "13px" }}>Start reconciliation immediately after upload</span>
              </label>

              <PendingSubmitButton className="primary-button" pendingLabel="Validating & preserving">
                <CloudArrowUp size={18} />
                Upload &amp; Reconcile CSV
              </PendingSubmitButton>
            </form>
            {csvImports !== null && csvImports.length > 0 ? (
              <div className="source-history">
                <strong>Recent imports</strong>
                {csvImports.slice(0, 4).map((item) => (
                  <div key={item.importId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{item.fileName}</span>
                      <small style={{ display: "block" }}>
                        {Number(item.rowCount).toLocaleString()} rows · {new Date(item.createdAt).toLocaleDateString()}
                        {item.customerId && customerNameMap.has(item.customerId) ? ` · ${customerNameMap.get(item.customerId)}` : ""}
                      </small>
                    </div>
                    <form action={reconcileCsvImport} style={{ margin: 0 }}>
                      <input name="importId" type="hidden" value={item.importId} />
                      {item.customerId ? <input name="customerId" type="hidden" value={item.customerId} /> : null}
                      <PendingSubmitButton className="secondary-button" pendingLabel="Reconciling...">
                        Start Reconciliation
                      </PendingSubmitButton>
                    </form>
                  </div>
                ))}
              </div>
            ) : null}
          </article>

          <article className="source-card">
            <div className="source-card-head">
              <span className="source-icon"><Broadcast size={22} /></span>
              <span className="status-pill">
                {connections?.some((item) => item.provider === "network_scanner") ? "Configured" : "22+ Networks"}
              </span>
            </div>
            <div>
              <p className="eyebrow">On-Chain Verification</p>
              <h3>Blockchain Scanners</h3>
              <p>Configure 22+ blockchain scanner APIs (Etherscan, BscScan, PolygonScan, etc.) to verify and trace transactions on-chain.</p>
            </div>
            <details className="source-setup" open={connections?.some((item) => item.provider === "network_scanner") ? undefined : false}>
              <summary>
                {connections?.some((item) => item.provider === "network_scanner") ? "Configure another scanner" : "Connect Network Scanner"}
              </summary>
              <ScannerConfigForm
                customers={snapshot?.customers}
                defaultCustomerId={activeCustomerId}
                isCustomer={isCustomer}
                scanners={supportedScanners}
              />
            </details>
          </article>

          <article className="source-card">
            <div className="source-card-head">
              <span className="source-icon"><Wallet size={22} /></span>
              <span className="status-pill">
                {connections?.some((item) => item.provider === "company_wallet") ? "Configured" : "Inter-Wallet"}
              </span>
            </div>
            <div>
              <p className="eyebrow">Internal Balances</p>
              <h3>Company Wallets</h3>
              <p>Register internal company wallets (Treasury, Hot wallet) to detect and isolate inter-wallet transfers with zero net revenue distortion.</p>
            </div>
            <details className="source-setup">
              <summary>
                {connections?.some((item) => item.provider === "company_wallet") ? "Register another wallet" : "Add Company Wallet"}
              </summary>
              <WalletConfigForm
                customers={snapshot?.customers}
                defaultCustomerId={activeCustomerId}
                isCustomer={isCustomer}
              />
            </details>
          </article>

          <article className="source-card">
            <div className="source-card-head">
              <span className="source-icon source-icon-qb">Q</span>
              <span className="status-pill">
                {connections?.some((item) => item.provider === "quickbooks") ? "Configured" : "Setup required"}
              </span>
            </div>
            <div>
              <p className="eyebrow">Accounting</p>
              <h3>QuickBooks Online</h3>
              <p>Register the company and a server-side vault reference for its OAuth credential bundle.</p>
            </div>
            <details className="source-setup">
              <summary>
                {connections?.some((item) => item.provider === "quickbooks") ? "Update setup" : "Connect QuickBooks"}
              </summary>
              <form action={configureDataConnection} className="source-connect-form">
                <input name="provider" type="hidden" value="quickbooks" />
                {!isCustomer && snapshot?.customers && snapshot.customers.length > 0 ? (
                  <>
                    <label htmlFor="qb-customer">Target Customer (Optional)</label>
                    <select id="qb-customer" name="customerId" defaultValue={activeCustomerId ?? ""}>
                      <option value="">Tenant-wide (Default)</option>
                      {snapshot.customers.map((c) => (
                        <option key={c.customerId} value={c.customerId}>
                          {c.displayName}
                        </option>
                      ))}
                    </select>
                  </>
                ) : null}
                <label htmlFor="qb-name">Connection name</label>
                <input defaultValue="QuickBooks Online" id="qb-name" name="displayName" required />
                <label htmlFor="qb-company">QuickBooks company ID</label>
                <input id="qb-company" name="companyId" required />
                <label htmlFor="qb-environment">Environment</label>
                <select defaultValue="sandbox" id="qb-environment" name="environment">
                  <option value="sandbox">Sandbox</option>
                  <option value="production">Production</option>
                </select>
                <label htmlFor="qb-secret">Credential-bundle reference</label>
                <input id="qb-secret" name="secretReference" placeholder="vault://quickbooks/oauth-bundle" required />
                <p className="form-help">
                  Reference a server-side vault entry containing the client credentials. Never paste credentials into OrbitOS.
                </p>
                <PendingSubmitButton className="primary-button" pendingLabel="Saving QuickBooks setup">
                  Save secure setup
                </PendingSubmitButton>
              </form>
            </details>
          </article>

          <article className="source-card">
            <div className="source-card-head">
              <span className="source-icon"><Vault size={22} /></span>
              <span className="status-pill">
                {connections?.some((item) => item.provider === "fireblocks") ? "Configured" : "Setup required"}
              </span>
            </div>
            <div>
              <p className="eyebrow">Custody</p>
              <h3>Fireblocks</h3>
              <p>Register workspace and vault reference to read-only API identity for live vault balance reconciliations.</p>
            </div>
            <details className="source-setup">
              <summary>
                {connections?.some((item) => item.provider === "fireblocks") ? "Update setup" : "Connect Fireblocks"}
              </summary>
              <form action={configureDataConnection} className="source-connect-form">
                <input name="provider" type="hidden" value="fireblocks" />
                {!isCustomer && snapshot?.customers && snapshot.customers.length > 0 ? (
                  <>
                    <label htmlFor="fb-customer">Target Customer (Optional)</label>
                    <select id="fb-customer" name="customerId" defaultValue={activeCustomerId ?? ""}>
                      <option value="">Tenant-wide (Default)</option>
                      {snapshot.customers.map((c) => (
                        <option key={c.customerId} value={c.customerId}>
                          {c.displayName}
                        </option>
                      ))}
                    </select>
                  </>
                ) : null}
                <label htmlFor="fb-name">Connection name</label>
                <input defaultValue="Fireblocks Custody" id="fb-name" name="displayName" required />
                <label htmlFor="fb-workspace">Workspace ID</label>
                <input defaultValue="fb-workspace-1" id="fb-workspace" name="workspaceId" required />
                <label htmlFor="fb-url">API base URL</label>
                <input defaultValue="https://api.fireblocks.io" id="fb-url" name="baseUrl" required type="url" />
                <label htmlFor="fb-secret">API-identity reference</label>
                <input id="fb-secret" name="secretReference" placeholder="vault://fireblocks/read-only-identity" required />
                <p className="form-help">
                  Reference a server-side vault entry containing the read-only API credentials. OrbitOS stores only the reference.
                </p>
                <PendingSubmitButton className="primary-button" pendingLabel="Saving Fireblocks setup">
                  Save secure setup
                </PendingSubmitButton>
              </form>
            </details>
          </article>
        </div>
      </section>

      <section className="integration-grid">
        <form action={createIntegration} className="configuration-form">
          <div className="section-heading">
            <p className="eyebrow">Read-only chain source</p>
            <h2>Add BSC integration</h2>
          </div>
          {!isCustomer && snapshot?.customers && snapshot.customers.length > 0 ? (
            <>
              <label htmlFor="bsc-customer">Target Customer (Optional)</label>
              <select id="bsc-customer" name="customerId" defaultValue={activeCustomerId ?? ""}>
                <option value="">Tenant-wide (Default)</option>
                {snapshot.customers.map((c) => (
                  <option key={c.customerId} value={c.customerId}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <label htmlFor="chainId">Network</label>
          <select defaultValue="56" id="chainId" name="chainId">
            <option value="56">BSC Mainnet</option>
            <option value="97">BSC Testnet</option>
          </select>
          <label htmlFor="startingBlock">Starting block</label>
          <input defaultValue="40000000" id="startingBlock" inputMode="numeric" name="startingBlock" pattern="[0-9]+" required type="text" />
          <label htmlFor="walletAddress">Wallet address</label>
          <input defaultValue="0x28a1c8942b00508a546d0a42426027a0033d5964" id="walletAddress" name="walletAddress" pattern="0x[a-fA-F0-9]{40}" placeholder="0x…" required type="text" />
          <label htmlFor="tokenContract">Token contract</label>
          <input defaultValue="0x55d398326f99059ff775485246999027b3197955" id="tokenContract" name="tokenContract" pattern="0x[a-fA-F0-9]{40}" placeholder="0x…" required type="text" />
          <p className="form-help">
            Provider endpoints are selected from the validated OrbitOS capability matrix. No signing key is requested or stored.
          </p>
          <PendingSubmitButton className="primary-button" pendingLabel="Creating integration">
            Create integration
          </PendingSubmitButton>
        </form>

        <section aria-labelledby="configured-integrations" className="integration-list">
          <div className="section-heading">
            <p className="eyebrow">Workspace inventory</p>
            <h2 id="configured-integrations">Configured integrations</h2>
          </div>
          {integrations === null ? (
            <div className="inline-alert" role="alert">
              <strong>Integration service unavailable</strong>
              OrbitOS could not load the workspace integration inventory.
            </div>
          ) : integrations.length === 0 ? (
            <div className="empty-state">
              <PlugsConnected aria-hidden="true" size={24} weight="regular" />
              <strong>No integrations yet</strong>
              <span>Add the first read-only source using this form.</span>
            </div>
          ) : (
            <ul className="integration-cards">
              {integrations.map((integration) => (
                <li key={integration.integrationId}>
                  <div>
                    <strong>{integration.network.chainId === "56" ? "BSC Mainnet" : "BSC Testnet"}</strong>
                    <span>From block {integration.startingBlock}</span>
                    {integration.customerId && customerNameMap.has(integration.customerId) ? (
                      <span className="status-badge" style={{ marginLeft: "8px" }}>
                        {customerNameMap.get(integration.customerId)}
                      </span>
                    ) : null}
                  </div>
                  <span className="status-badge">{integration.enabled ? "Active" : "Disabled"}</span>
                  <dl>
                    <div><dt>Wallets</dt><dd>{integration.walletAddresses.length}</dd></div>
                    <div><dt>Tokens</dt><dd>{integration.tokenContracts.length}</dd></div>
                    <div><dt>Providers</dt><dd>{integration.providerGroups.length}</dd></div>
                  </dl>
                  <div className="card-actions">
                    <form action={setIntegrationEnabled}>
                      <input name="integrationId" type="hidden" value={integration.integrationId} />
                      <input name="enabled" type="hidden" value={integration.enabled ? "false" : "true"} />
                      <PendingSubmitButton className="secondary-button" pendingLabel={integration.enabled ? "Disabling" : "Enabling"}>
                        {integration.enabled ? "Disable" : "Enable"}
                      </PendingSubmitButton>
                    </form>
                    {integration.enabled ? (
                      <form action={startIngestion} className="inline-run-form">
                        <input name="integrationId" type="hidden" value={integration.integrationId} />
                        <label htmlFor={`endBlock-${integration.integrationId}`}>End block</label>
                        <input
                          defaultValue={integration.startingBlock}
                          id={`endBlock-${integration.integrationId}`}
                          inputMode="numeric"
                          name="endBlock"
                          pattern="[0-9]+"
                          required
                          type="text"
                        />
                        <PendingSubmitButton className="primary-button" pendingLabel="Running range">
                          Run bounded range
                        </PendingSubmitButton>
                      </form>
                    ) : null}
                  </div>
                  <details>
                    <summary>Edit source scope</summary>
                    <form action={updateIntegrationConfiguration} className="inline-run-form">
                      <input name="integrationId" type="hidden" value={integration.integrationId} />
                      <label htmlFor={`startingBlock-${integration.integrationId}`}>Starting block</label>
                      <input
                        defaultValue={integration.startingBlock}
                        id={`startingBlock-${integration.integrationId}`}
                        inputMode="numeric"
                        name="startingBlock"
                        pattern="[0-9]+"
                        required
                        type="text"
                      />
                      <label htmlFor={`walletAddress-${integration.integrationId}`}>Wallet address</label>
                      <input
                        defaultValue={integration.walletAddresses[0]}
                        id={`walletAddress-${integration.integrationId}`}
                        name="walletAddress"
                        pattern="0x[a-fA-F0-9]{40}"
                        required
                        type="text"
                      />
                      <label htmlFor={`tokenContract-${integration.integrationId}`}>Token contract</label>
                      <input
                        defaultValue={integration.tokenContracts[0]}
                        id={`tokenContract-${integration.integrationId}`}
                        name="tokenContract"
                        pattern="0x[a-fA-F0-9]{40}"
                        required
                        type="text"
                      />
                      <PendingSubmitButton className="secondary-button" pendingLabel="Saving changes">
                        Save changes
                      </PendingSubmitButton>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>

      {runs !== null && runs.length > 0 ? (
        <section aria-labelledby="ingestion-history" className="history-panel">
          <div className="section-heading">
            <p className="eyebrow">Deterministic audit log</p>
            <h2 id="ingestion-history">Ingestion runs</h2>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Range</th>
                  <th>Checkpoint</th>
                  <th>Ingested</th>
                  <th>Quarantined</th>
                  <th>Control</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.runId}>
                    <td>
                      <span className={`status-badge status-${run.state}`}>{run.state}</span>
                    </td>
                    <td>
                      {run.startBlock} → {run.endBlock}
                    </td>
                    <td className="mono-value">{run.checkpointBlock ?? "None"}</td>
                    <td>{run.movementCount}</td>
                    <td>{run.quarantineCount}</td>
                    <td>
                      {run.state === "running" ? (
                        <div className="table-actions">
                          <form action={controlIngestionRun}>
                            <input name="runId" type="hidden" value={run.runId} />
                            <input name="runAction" type="hidden" value="pause" />
                            <PendingSubmitButton className="secondary-button" pendingLabel="Pausing">
                              Pause
                            </PendingSubmitButton>
                          </form>
                          <form action={controlIngestionRun}>
                            <input name="runId" type="hidden" value={run.runId} />
                            <input name="runAction" type="hidden" value="stop" />
                            <PendingSubmitButton className="secondary-button" pendingLabel="Stopping">
                              Stop
                            </PendingSubmitButton>
                          </form>
                        </div>
                      ) : run.state === "paused" ? (
                        <form action={controlIngestionRun}>
                          <input name="runId" type="hidden" value={run.runId} />
                          <input name="runAction" type="hidden" value="resume" />
                          <PendingSubmitButton className="secondary-button" pendingLabel="Resuming">
                            Resume
                          </PendingSubmitButton>
                        </form>
                      ) : (
                        <span className="muted-copy">{run.state}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {connections !== null && connections.length > 0 ? (
        <section aria-labelledby="connections-inventory" className="history-panel" style={{ marginTop: "24px" }}>
          <div className="section-heading">
            <p className="eyebrow">Enterprise Telemetry Sources</p>
            <h2 id="connections-inventory">Configured Data Sources &amp; Network Scanners ({connections.length})</h2>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Provider / Name</th>
                  <th>Customer Scope</th>
                  <th>Configuration Details</th>
                  <th>Status</th>
                  <th>Configured Date</th>
                </tr>
              </thead>
              <tbody>
                {connections.map((c) => {
                  const customerLabel = c.customerId && customerNameMap.has(c.customerId)
                    ? customerNameMap.get(c.customerId)
                    : "Tenant-wide (Default)";
                  return (
                    <tr key={c.connectionId}>
                      <td>
                        <strong>{c.displayName}</strong>
                        <span className="table-subline" style={{ textTransform: "uppercase" }}>{c.provider.replace("_", " ")}</span>
                      </td>
                      <td>
                        <span className="status-badge">{customerLabel}</span>
                      </td>
                      <td className="mono-value" style={{ fontSize: "0.78rem" }}>
                        {c.provider === "network_scanner" ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span>API: {c.publicConfiguration.apiUrl}</span>
                            {c.publicConfiguration.explorerUrl ? (
                              <a
                                href={c.publicConfiguration.explorerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: "var(--color-accent)", textDecoration: "underline" }}
                              >
                                Explorer ↗
                              </a>
                            ) : null}
                          </div>
                        ) : c.provider === "company_wallet" ? (
                          <span>Address: {c.publicConfiguration.address} ({c.publicConfiguration.network})</span>
                        ) : c.provider === "fireblocks" ? (
                          <span>Workspace: {c.publicConfiguration.workspaceId} · {c.publicConfiguration.baseUrl}</span>
                        ) : (
                          <span>Company: {c.publicConfiguration.companyId} ({c.publicConfiguration.environment})</span>
                        )}
                      </td>
                      <td>
                        <span className={`status-badge status-${c.status}`}>{c.status}</span>
                      </td>
                      <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}

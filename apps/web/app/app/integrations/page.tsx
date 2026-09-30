import { CloudArrowUp, FileCsv, PlugsConnected, Vault } from "@phosphor-icons/react/dist/ssr";

import { PendingSubmitButton } from "../../../components/pending-submit-button";
import { loadCsvImports, loadDataConnections, loadIngestionRuns, loadIntegrations } from "../../../lib/session";
import {
  configureDataConnection,
  controlIngestionRun,
  createIntegration,
  setIntegrationEnabled,
  startIngestion,
  updateIntegrationConfiguration,
  uploadCsvImport,
} from "./actions";

export default async function IntegrationsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ connected?: string; created?: string; error?: string; imported?: string; run?: string; updated?: string }>;
}>) {
  const [integrations, runs, connections, csvImports] = await Promise.all([
    loadIntegrations(),
    loadIngestionRuns(),
    loadDataConnections(),
    loadCsvImports(),
  ]);
  const status = await searchParams;

  return (
    <main className="page">
      <header className="page-header">
        <h1>Integrations</h1>
        <p>
          Bring accounting, custody, spreadsheet, and blockchain sources into one evidence-backed workspace.
        </p>
      </header>

      {status.connected === "1" ? <p className="success-alert" role="status">Secure connection references saved. No provider credential was stored in the application database.</p> : null}
      {status.imported === "1" ? <p className="success-alert" role="status">CSV validated and preserved as immutable source evidence.</p> : null}

      {status.created === "1" ? (
        <p className="success-alert" role="status">Integration created inside this company workspace.</p>
      ) : null}
      {status.updated === "1" ? (
        <p className="success-alert" role="status">Operator action saved inside this company workspace.</p>
      ) : null}
      {status.run === "1" ? (
        <p className="success-alert" role="status">Bounded ingestion finished. Review the run and normalized movements.</p>
      ) : null}
      {status.error !== undefined ? (
        <p className="form-error" role="alert">
          {status.error === "csv-invalid"
            ? "Choose a valid UTF-8 CSV under 1 MB with a header and at least one data row."
            : status.error === "csv-unavailable"
              ? "The CSV could not be preserved. No partial import was created."
              : status.error === "connection-invalid"
                ? "Check the connection identifiers and vault reference."
                : status.error === "connection-unavailable"
                  ? "The secure connection references could not be saved."
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
          <p>Every action validates first, shows progress immediately, and either completes fully or leaves no partial configuration.</p>
        </div>

        <div className="source-card-grid">
          <article className="source-card source-card-ready">
            <div className="source-card-head"><span className="source-icon"><FileCsv size={22} /></span><span className="status-pill status-active">Ready</span></div>
            <div><p className="eyebrow">File import</p><h3>CSV upload</h3><p>Preserve the original file with a SHA-256 digest and record its validated row count.</p></div>
            <form action={uploadCsvImport} className="source-connect-form">
              <label htmlFor="csv-file">CSV file</label>
              <input accept=".csv,text/csv" id="csv-file" name="csvFile" required type="file" />
              <span className="form-help">UTF-8 · header required · up to 1 MB / 50,000 rows</span>
              <PendingSubmitButton className="primary-button" pendingLabel="Validating & preserving"><CloudArrowUp size={18} />Upload CSV</PendingSubmitButton>
            </form>
            {csvImports !== null && csvImports.length > 0 ? <div className="source-history"><strong>Recent imports</strong>{csvImports.slice(0, 3).map((item) => <span key={item.importId}><span>{item.fileName}</span><small>{Number(item.rowCount).toLocaleString()} rows · {new Date(item.createdAt).toLocaleDateString()}</small></span>)}</div> : null}
          </article>

          <article className="source-card">
            <div className="source-card-head"><span className="source-icon source-icon-qb">Q</span><span className="status-pill">{connections?.some((item) => item.provider === "quickbooks") ? "Configured" : "Setup required"}</span></div>
            <div><p className="eyebrow">Accounting</p><h3>QuickBooks Online</h3><p>Register the company and a server-side vault reference for its OAuth credential bundle.</p></div>
            <details className="source-setup"><summary>{connections?.some((item) => item.provider === "quickbooks") ? "Update setup" : "Connect QuickBooks"}</summary>
              <form action={configureDataConnection} className="source-connect-form">
                <input name="provider" type="hidden" value="quickbooks" />
                <label htmlFor="qb-name">Connection name</label><input defaultValue="QuickBooks Online" id="qb-name" name="displayName" required />
                <label htmlFor="qb-company">QuickBooks company ID</label><input id="qb-company" name="companyId" required />
                <label htmlFor="qb-environment">Environment</label><select defaultValue="sandbox" id="qb-environment" name="environment"><option value="sandbox">Sandbox</option><option value="production">Production</option></select>
                <label htmlFor="qb-secret">Credential-bundle reference</label><input id="qb-secret" name="secretReference" placeholder="vault://quickbooks/oauth-bundle" required />
                <p className="form-help">Reference a server-side vault entry containing the client credentials. Never paste credentials into OrbitOS.</p>
                <PendingSubmitButton className="primary-button" pendingLabel="Saving QuickBooks setup">Save secure setup</PendingSubmitButton>
              </form>
            </details>
          </article>

          <article className="source-card">
            <div className="source-card-head"><span className="source-icon"><Vault size={22} /></span><span className="status-pill">{connections?.some((item) => item.provider === "fireblocks") ? "Configured" : "Setup required"}</span></div>
            <div><p className="eyebrow">Custody</p><h3>Fireblocks</h3><p>Register the workspace and a vault reference to a read-only API identity. Transfer permissions are not requested.</p></div>
            <details className="source-setup"><summary>{connections?.some((item) => item.provider === "fireblocks") ? "Update setup" : "Connect Fireblocks"}</summary>
              <form action={configureDataConnection} className="source-connect-form">
                <input name="provider" type="hidden" value="fireblocks" />
                <label htmlFor="fb-name">Connection name</label><input defaultValue="Fireblocks" id="fb-name" name="displayName" required />
                <label htmlFor="fb-workspace">Workspace ID</label><input id="fb-workspace" name="workspaceId" required />
                <label htmlFor="fb-url">API base URL</label><input defaultValue="https://api.fireblocks.io" id="fb-url" name="baseUrl" required type="url" />
                <label htmlFor="fb-secret">API-identity reference</label><input id="fb-secret" name="secretReference" placeholder="vault://fireblocks/read-only-identity" required />
                <p className="form-help">Reference a server-side vault entry containing the API key and private key. OrbitOS stores only the reference.</p>
                <PendingSubmitButton className="primary-button" pendingLabel="Saving Fireblocks setup">Save secure setup</PendingSubmitButton>
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
          <label htmlFor="chainId">Network</label>
          <select defaultValue="97" id="chainId" name="chainId">
            <option value="97">BSC Testnet</option>
            <option value="56">BSC Mainnet</option>
          </select>
          <label htmlFor="startingBlock">Starting block</label>
          <input id="startingBlock" inputMode="numeric" name="startingBlock" pattern="[0-9]+" required type="text" />
          <label htmlFor="walletAddress">Wallet address</label>
          <input id="walletAddress" name="walletAddress" pattern="0x[a-fA-F0-9]{40}" placeholder="0x…" required type="text" />
          <label htmlFor="tokenContract">Token contract</label>
          <input id="tokenContract" name="tokenContract" pattern="0x[a-fA-F0-9]{40}" placeholder="0x…" required type="text" />
          <p className="form-help">Provider endpoints are selected from the validated OrbitOS capability matrix. No signing key is requested or stored.</p>
          <PendingSubmitButton className="primary-button" pendingLabel="Creating integration">Create integration</PendingSubmitButton>
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
                        <PendingSubmitButton className="primary-button" pendingLabel="Running range">Run bounded range</PendingSubmitButton>
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
                      <PendingSubmitButton className="secondary-button" pendingLabel="Saving scope">Save source scope</PendingSubmitButton>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>

      <section aria-labelledby="run-history" className="run-history">
        <div className="section-heading">
          <p className="eyebrow">Checkpointed operations</p>
          <h2 id="run-history">Run history</h2>
        </div>
        {runs === null ? (
          <div className="inline-alert" role="alert">Run history is temporarily unavailable.</div>
        ) : runs.length === 0 ? (
          <div className="empty-state"><strong>No bounded runs yet</strong><span>Start from an active integration above.</span></div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Range</th><th>Checkpoint</th><th>Movements</th><th>Quarantine</th><th>State</th><th>Control</th></tr></thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.runId}>
                    <td>{run.startBlock}–{run.endBlock}</td>
                    <td>{run.checkpointBlock ?? "Not advanced"}</td>
                    <td>{run.movementCount}</td>
                    <td>{run.quarantineCount}</td>
                    <td><span className="status-badge">{run.state}</span></td>
                    <td>
                      {run.state === "running" || run.state === "paused" || run.state === "failed" ? (
                        <form action={controlIngestionRun} className="run-controls">
                          <input name="runId" type="hidden" value={run.runId} />
                          {run.state === "running" ? <PendingSubmitButton className="secondary-button" name="runAction" pendingLabel="Pausing" value="pause">Pause</PendingSubmitButton> : null}
                          {run.state === "paused" || run.state === "failed" ? <PendingSubmitButton className="secondary-button" name="runAction" pendingLabel="Resuming" value="resume">Resume</PendingSubmitButton> : null}
                          <PendingSubmitButton className="secondary-button" name="runAction" pendingLabel="Stopping" value="stop">Stop</PendingSubmitButton>
                        </form>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

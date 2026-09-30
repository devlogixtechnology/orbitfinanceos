import { PlugsConnected } from "@phosphor-icons/react/dist/ssr";

import { PendingSubmitButton } from "../../../components/pending-submit-button";
import { loadIngestionRuns, loadIntegrations } from "../../../lib/session";
import {
  controlIngestionRun,
  createIntegration,
  setIntegrationEnabled,
  startIngestion,
  updateIntegrationConfiguration,
} from "./actions";

export default async function IntegrationsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ created?: string; error?: string; run?: string; updated?: string }>;
}>) {
  const [integrations, runs] = await Promise.all([loadIntegrations(), loadIngestionRuns()]);
  const status = await searchParams;

  return (
    <main className="page">
      <header className="page-header">
        <h1>Integrations</h1>
        <p>
          Configure an allowlisted wallet and token contract against two independently operated, read-only BNB Smart Chain providers.
        </p>
      </header>

      {status.created === "1" ? (
        <p className="success-alert" role="status">Integration created and tenant scoped.</p>
      ) : null}
      {status.updated === "1" ? (
        <p className="success-alert" role="status">Operator action saved with tenant scope.</p>
      ) : null}
      {status.run === "1" ? (
        <p className="success-alert" role="status">Bounded ingestion finished. Review the run and normalized movements.</p>
      ) : null}
      {status.error !== undefined ? (
        <p className="form-error" role="alert">
          {status.error === "invalid"
            ? "Check the chain, block number, wallet, and token contract values."
            : status.error === "run"
              ? "The bounded run could not complete. Its checkpoint and quarantine state were preserved."
              : "The integration could not be saved. Please try again."}
        </p>
      ) : null}

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
            <p className="eyebrow">Tenant inventory</p>
            <h2 id="configured-integrations">Configured integrations</h2>
          </div>
          {integrations === null ? (
            <div className="inline-alert" role="alert">
              <strong>Integration service unavailable</strong>
              OrbitOS could not load the tenant integration inventory.
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

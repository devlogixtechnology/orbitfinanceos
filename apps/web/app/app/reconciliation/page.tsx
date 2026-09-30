import Link from "next/link";

import { PendingSubmitButton } from "../../../components/pending-submit-button";
import { loadReconciliations } from "../../../lib/session";
import { runReconciliation } from "./actions";

export default async function ReconciliationPage() {
  const results = await loadReconciliations();
  return (
    <main className="page">
      <header className="page-header">
        <p className="eyebrow">Verified facts → exact positions</p>
        <h1>Reconciliation</h1>
        <p>Exact atomic-unit roll-forwards. Pending, degraded, and conflicted movements are excluded from verified positions.</p>
      </header>
      <details className="detail-panel">
        <summary>Run an exact position reconciliation</summary>
        <form action={runReconciliation} className="configuration-form workflow-form">
          <label htmlFor="reconciliation-wallet">Wallet address</label><input id="reconciliation-wallet" name="walletAddress" required />
          <label htmlFor="reconciliation-asset">Asset ID</label><input id="reconciliation-asset" name="assetId" placeholder="bsc:56:0x… or bsc:56:native" required />
          <label htmlFor="reconciliation-cutoff">Cutoff (UTC)</label><input id="reconciliation-cutoff" name="cutoff" placeholder="2026-09-29T23:59:59.000Z" required />
          <label htmlFor="reconciliation-opening">Opening atomic quantity</label><input id="reconciliation-opening" name="openingQuantityAtomic" pattern="-?(0|[1-9][0-9]*)" required />
          <label htmlFor="reconciliation-observed">Observed closing atomic quantity (optional)</label><input id="reconciliation-observed" name="observedClosingQuantityAtomic" pattern="-?(0|[1-9][0-9]*)" />
          <input name="policyVersion" type="hidden" value="bsc-v1" />
          <PendingSubmitButton className="primary-button" pendingLabel="Reconciling">Run reconciliation</PendingSubmitButton>
        </form>
      </details>
      {results === null ? (
        <div className="inline-alert" role="alert"><strong>Reconciliation unavailable</strong>OrbitOS could not load control results.</div>
      ) : results.length === 0 ? (
        <div className="empty-state"><strong>No reconciliation results</strong><span>Results appear after independently verified movements reach a governed cutoff.</span></div>
      ) : (
        <div className="table-scroll"><table>
          <thead><tr><th>Cutoff</th><th>Wallet / asset</th><th>Expected closing</th><th>Difference</th><th>State</th><th>Exceptions</th></tr></thead>
          <tbody>{results.map((result) => <tr key={result.reconciliationId}>
            <td><Link href={`/app/reconciliation/${result.reconciliationId}`}>{result.cutoff}</Link></td>
            <td className="mono-value">{result.walletAddress}<span>{result.assetId}</span></td>
            <td className="mono-value">{result.expectedClosingQuantityAtomic}</td>
            <td className="mono-value">{result.differenceAtomic ?? "Not observed"}</td>
            <td><span className={`status-badge status-${result.state}`}>{result.state.replace("_", " ")}</span></td>
            <td>{result.exceptionCount}</td>
          </tr>)}</tbody>
        </table></div>
      )}
    </main>
  );
}

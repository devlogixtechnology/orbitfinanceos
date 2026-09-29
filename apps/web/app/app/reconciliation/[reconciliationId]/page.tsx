import { notFound } from "next/navigation";

import { loadReconciliation } from "../../../../lib/session";

export default async function ReconciliationDetailPage({ params }: Readonly<{ params: Promise<{ reconciliationId: string }> }>) {
  const { reconciliationId } = await params;
  const result = await loadReconciliation(reconciliationId);
  if (result === null) notFound();
  return (
    <main className="page">
      <header className="page-header"><p className="eyebrow">Exact position control</p><h1>Reconciliation detail</h1><p>{result.cutoff} · policy {result.policyVersion}</p></header>
      <section className="detail-panel">
        <dl className="detail-grid">
          <div><dt>Wallet</dt><dd className="mono-value">{result.walletAddress}</dd></div>
          <div><dt>Asset</dt><dd className="mono-value">{result.assetId}</dd></div>
          <div><dt>Opening</dt><dd className="mono-value">{result.openingQuantityAtomic}</dd></div>
          <div><dt>Verified incoming</dt><dd className="mono-value">{result.incomingQuantityAtomic}</dd></div>
          <div><dt>Verified outgoing</dt><dd className="mono-value">{result.outgoingQuantityAtomic}</dd></div>
          <div><dt>Verified fees</dt><dd className="mono-value">{result.feeQuantityAtomic}</dd></div>
          <div><dt>Expected closing</dt><dd className="mono-value">{result.expectedClosingQuantityAtomic}</dd></div>
          <div><dt>Observed closing</dt><dd className="mono-value">{result.observedClosingQuantityAtomic ?? "Not supplied"}</dd></div>
          <div><dt>Exact difference</dt><dd className="mono-value">{result.differenceAtomic ?? "Not applicable"}</dd></div>
          <div><dt>Result</dt><dd>{result.state.replace("_", " ")}</dd></div>
        </dl>
        <h2>Movement-set controls</h2>
        <p>{result.verifiedMovementIds.length} verified movement(s) included; {result.excludedMovementIds.length} incomplete or conflicted movement(s) excluded.</p>
        {result.excludedMovementIds.length > 0 && <ul className="evidence-list">{result.excludedMovementIds.map((id) => <li className="mono-value" key={id}>{id}</li>)}</ul>}
      </section>
    </main>
  );
}

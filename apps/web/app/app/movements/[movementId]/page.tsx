import { notFound } from "next/navigation";

import { loadMovements, loadVerificationDecisions } from "../../../../lib/session";

export default async function MovementDetailPage({ params }: Readonly<{ params: Promise<{ movementId: string }> }>) {
  const { movementId } = await params;
  const movements = await loadMovements();
  const movement = movements?.find((item) => item.movementId === movementId);
  if (movement === undefined) notFound();
  const decisions = await loadVerificationDecisions(movementId);
  const latestDecision = decisions?.at(-1);

  return (
    <main className="page">
      <header className="page-header">
        <p className="eyebrow">Evidence-backed normalized record</p>
        <h1>Movement detail</h1>
        <p className="mono-value">{movement.transactionHash}</p>
      </header>
      <section className="detail-panel">
        <dl className="detail-grid">
          <div><dt>Network</dt><dd>BSC {movement.network.chainId}</dd></div>
          <div><dt>Block</dt><dd>{movement.blockNumber}</dd></div>
          <div><dt>Effective time</dt><dd>{movement.effectiveAt}</dd></div>
          <div><dt>Log index</dt><dd>{movement.logIndex ?? "Native fee"}</dd></div>
          <div><dt>Kind</dt><dd>{movement.kind}</dd></div>
          <div><dt>From / fee payer</dt><dd className="mono-value">{movement.fromAddress}</dd></div>
          <div><dt>To</dt><dd className="mono-value">{movement.toAddress ?? "Network fee"}</dd></div>
          <div><dt>Token contract</dt><dd className="mono-value">{movement.asset.contractAddress ?? "Native BNB"}</dd></div>
          <div><dt>Atomic quantity</dt><dd className="mono-value">{movement.quantityAtomic}</dd></div>
          <div><dt>Display quantity</dt><dd className="mono-value">{movement.quantityDisplay ?? "Metadata unavailable; atomic only"}</dd></div>
          <div><dt>Observed state</dt><dd>{movement.observedState}</dd></div>
          <div><dt>Normalized state</dt><dd>{movement.normalizedState}</dd></div>
          <div><dt>Verification</dt><dd>{latestDecision?.verification ?? "Pending — no decision recorded"}</dd></div>
          <div><dt>Parser version</dt><dd>{movement.parserVersion}</dd></div>
        </dl>
        <h2>Verification dimensions</h2>
        {latestDecision === undefined ? (
          <p className="muted-copy">No independent verification decision is available yet.</p>
        ) : (
          <dl className="detail-grid">
            <div><dt>Inclusion</dt><dd>{latestDecision.inclusion}</dd></div>
            <div><dt>Execution</dt><dd>{latestDecision.execution}</dd></div>
            <div><dt>Finality</dt><dd>{latestDecision.finality}</dd></div>
            <div><dt>Provider agreement</dt><dd>{latestDecision.agreement}</dd></div>
            <div><dt>Policy</dt><dd>{latestDecision.policyVersion}</dd></div>
            <div><dt>Independent groups</dt><dd>{new Set(latestDecision.observations.map((item) => item.independenceGroup)).size}</dd></div>
            <div><dt>Decision time</dt><dd>{latestDecision.decidedAt}</dd></div>
            <div><dt>Reason codes</dt><dd>{latestDecision.reasonCodes.join(", ")}</dd></div>
          </dl>
        )}
        <h2>Raw evidence references</h2>
        <ul className="evidence-list">
          {movement.evidenceIds.map((evidenceId) => <li className="mono-value" key={evidenceId}>{evidenceId}</li>)}
        </ul>
      </section>
    </main>
  );
}

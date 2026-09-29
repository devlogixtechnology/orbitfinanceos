import Link from "next/link";

import { loadMovements } from "../../../lib/session";

export default async function MovementsPage() {
  const movements = await loadMovements();

  return (
    <main className="page">
      <header className="page-header">
        <p className="eyebrow">Observed → normalized</p>
        <h1>Movements</h1>
        <p>Exact chain quantities with raw-evidence lineage. These records are not yet independently verified or reconciled.</p>
      </header>

      {movements === null ? (
        <div className="inline-alert" role="alert"><strong>Movement service unavailable</strong>OrbitOS could not load normalized movements.</div>
      ) : movements.length === 0 ? (
        <div className="empty-state"><strong>No normalized movements</strong><span>Complete a bounded ingestion run from Integrations.</span></div>
      ) : (
        <div className="table-scroll movement-table">
          <table>
            <thead><tr><th>Block</th><th>Type</th><th>Asset</th><th>Exact quantity</th><th>State</th><th>Evidence</th></tr></thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.movementId}>
                  <td>{movement.blockNumber}</td>
                  <td>{movement.kind === "native_fee" ? "Network fee" : "BEP-20 transfer"}</td>
                  <td>{movement.asset.symbol ?? movement.asset.contractAddress ?? "BNB"}</td>
                  <td className="mono-value">
                    {movement.quantityDisplay ?? movement.quantityAtomic}
                    <span>{movement.quantityDisplay === undefined ? " atomic units" : ` (${movement.quantityAtomic} atomic)`}</span>
                  </td>
                  <td><span className="status-badge">Normalized · unverified</span></td>
                  <td><Link href={`/app/movements/${movement.movementId}`}>{movement.evidenceIds.length} object{movement.evidenceIds.length === 1 ? "" : "s"}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

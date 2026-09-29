import Link from "next/link";

import { loadExceptions } from "../../../lib/session";

export default async function ExceptionsPage() {
  const exceptions = await loadExceptions();
  return (
    <main className="page">
      <header className="page-header"><p className="eyebrow">Operator work queue</p><h1>Exceptions</h1><p>Deterministically ordered unresolved control findings. Source evidence and derived quantities remain read-only.</p></header>
      {exceptions === null ? (
        <div className="inline-alert" role="alert"><strong>Exception service unavailable</strong>OrbitOS could not load the work queue.</div>
      ) : exceptions.length === 0 ? (
        <div className="empty-state"><strong>No exceptions</strong><span>No control findings require operator action.</span></div>
      ) : (
        <div className="table-scroll"><table>
          <thead><tr><th>Severity</th><th>Reason</th><th>Resource</th><th>State</th><th>Owner</th><th>Updated</th></tr></thead>
          <tbody>{exceptions.map((item) => <tr key={item.exceptionId}>
            <td>{item.severity}</td>
            <td><Link href={`/app/exceptions/${item.exceptionId}`}>{item.reasonCode}</Link></td>
            <td>{item.affectedResourceType}<span className="mono-value">{item.affectedResourceId}</span></td>
            <td><span className={`status-badge status-${item.state}`}>{item.state}</span></td>
            <td className="mono-value">{item.ownerActorId ?? "Unassigned"}</td>
            <td>{item.updatedAt}</td>
          </tr>)}</tbody>
        </table></div>
      )}
    </main>
  );
}

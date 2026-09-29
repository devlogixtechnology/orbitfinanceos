import { notFound } from "next/navigation";

import { loadException, loadExceptionEvents } from "../../../../lib/session";
import { updateExceptionWorkflow } from "../actions";

export default async function ExceptionDetailPage({ params }: Readonly<{ params: Promise<{ exceptionId: string }> }>) {
  const { exceptionId } = await params;
  const [item, events] = await Promise.all([loadException(exceptionId), loadExceptionEvents(exceptionId)]);
  if (item === null) notFound();
  return (
    <main className="page">
      <header className="page-header"><p className="eyebrow">Auditable operator workflow</p><h1>Exception detail</h1><p>{item.reasonCode}</p></header>
      <section className="detail-panel">
        <dl className="detail-grid">
          <div><dt>Severity</dt><dd>{item.severity}</dd></div><div><dt>State</dt><dd>{item.state}</dd></div>
          <div><dt>Affected resource</dt><dd>{item.affectedResourceType}</dd></div><div><dt>Resource ID</dt><dd className="mono-value">{item.affectedResourceId}</dd></div>
          <div><dt>Owner</dt><dd className="mono-value">{item.ownerActorId ?? "Unassigned"}</dd></div><div><dt>Resolution</dt><dd>{item.resolutionReasonCode ?? "Open"}</dd></div>
          <div><dt>Created</dt><dd>{item.createdAt}</dd></div><div><dt>Updated</dt><dd>{item.updatedAt}</dd></div>
        </dl>
        <h2>Authorized workflow update</h2>
        <form action={updateExceptionWorkflow} className="configuration-form workflow-form">
          <input name="exceptionId" type="hidden" value={item.exceptionId} />
          <label htmlFor="exception-state">State</label>
          <select defaultValue={item.state} id="exception-state" name="state"><option value="open">Open</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option></select>
          <label htmlFor="resolution-reason">Resolution reason code</label><input id="resolution-reason" name="resolutionReasonCode" placeholder="exception:confirmed_difference" />
          <label htmlFor="exception-note">Investigation note</label><textarea id="exception-note" maxLength={4000} name="note" rows={4} />
          <label className="checkbox-label"><input name="assignToMe" type="checkbox" /> Assign to me</label>
          <button className="primary-button" type="submit">Record workflow update</button>
          <p className="form-help">This changes workflow metadata only. Evidence and exact derived amounts cannot be edited.</p>
        </form>
        <h2>Audit history</h2>
        {events === null || events.length === 0 ? <p className="muted-copy">No workflow changes recorded.</p> : <ol className="audit-list">{events.map((event) => <li key={event.eventId}><strong>{event.action}</strong><span>{event.occurredAt} · {event.actorId}</span>{event.note && <p>{event.note}</p>}</li>)}</ol>}
      </section>
    </main>
  );
}

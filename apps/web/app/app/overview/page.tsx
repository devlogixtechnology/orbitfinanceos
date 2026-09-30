import {
  ArrowRight,
  ArrowsLeftRight,
  CheckCircle,
  PlugsConnected,
  Scales,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import {
  loadExceptions,
  loadIntegrations,
  loadMovements,
  loadReconciliations,
} from "../../../lib/session";

function countLabel(value: readonly unknown[] | null): string {
  return value === null ? "—" : String(value.length);
}

export default async function OverviewPage() {
  const [integrations, movements, reconciliations, exceptions] = await Promise.all([
    loadIntegrations(),
    loadMovements(),
    loadReconciliations(),
    loadExceptions(),
  ]);
  const hasUnavailableData = [integrations, movements, reconciliations, exceptions]
    .some((value) => value === null);
  const activeIntegrations = integrations?.filter((item) => item.enabled).length ?? 0;

  return (
    <main className="page">
      <section className="overview-hero">
        <header className="page-header overview-heading">
          <p className="eyebrow">Control center</p>
          <h1>Operational overview</h1>
          <p>
            A live tenant snapshot from source configuration through evidence-backed reconciliation and exception resolution.
          </p>
        </header>
        <div className="control-posture">
          <div className="control-posture-icon"><ShieldCheck aria-hidden="true" size={24} weight="fill" /></div>
          <div><span>Control posture</span><strong>Read-only · custody neutral</strong></div>
        </div>
      </section>

      {hasUnavailableData ? (
        <div className="inline-alert overview-alert" role="alert">
          <strong>Some operational data is temporarily unavailable</strong>
          Available counts remain visible. Refresh after the affected service recovers.
        </div>
      ) : null}

      <section aria-label="Current operational state" className="overview-metrics">
        <Link aria-label="View source inventory" className="metric-item" href="/app/integrations">
          <span className="metric-icon"><PlugsConnected aria-hidden="true" size={20} /></span>
          <span className="metric-label">Integrations</span>
          <strong>{countLabel(integrations)}</strong>
          <small>{activeIntegrations} active source{activeIntegrations === 1 ? "" : "s"}</small>
        </Link>
        <Link aria-label="View normalized records" className="metric-item" href="/app/movements">
          <span className="metric-icon"><ArrowsLeftRight aria-hidden="true" size={20} /></span>
          <span className="metric-label">Movements</span>
          <strong>{countLabel(movements)}</strong>
          <small>Exact normalized records</small>
        </Link>
        <Link aria-label="View control results" className="metric-item" href="/app/reconciliation">
          <span className="metric-icon analytic"><Scales aria-hidden="true" size={20} /></span>
          <span className="metric-label">Reconciliations</span>
          <strong>{countLabel(reconciliations)}</strong>
          <small>Governed position results</small>
        </Link>
        <Link aria-label="View work queue" className="metric-item" href="/app/exceptions">
          <span className="metric-icon warning"><WarningCircle aria-hidden="true" size={20} /></span>
          <span className="metric-label">Exceptions</span>
          <strong>{countLabel(exceptions)}</strong>
          <small>Items in the work queue</small>
        </Link>
      </section>

      <section className="overview-grid">
        <div className="overview-panel">
          <div className="section-heading overview-section-heading">
            <div><p className="eyebrow">Governed workflow</p><h2>From source to control result</h2></div>
            <CheckCircle aria-hidden="true" color="var(--color-success)" size={22} weight="fill" />
          </div>
          <ol className="workflow-steps">
            <li><span>01</span><div><strong>Connect a read-only source</strong><p>Approve wallet, token, network, and independent provider scope.</p></div></li>
            <li><span>02</span><div><strong>Preserve and verify evidence</strong><p>Normalize exact movements while retaining raw, content-addressed lineage.</p></div></li>
            <li><span>03</span><div><strong>Reconcile and resolve</strong><p>Roll verified facts forward and route differences into an auditable queue.</p></div></li>
          </ol>
        </div>

        <aside className="next-action-panel">
          <p className="eyebrow">Recommended next action</p>
          <h2>{integrations !== null && integrations.length > 0 ? "Review source activity" : "Configure the first source"}</h2>
          <p>
            {integrations !== null && integrations.length > 0
              ? "Open the integration inventory to review scope, run history, and checkpoints."
              : "Add an allowlisted BSC wallet and token contract. OrbitOS never requests a signing key."}
          </p>
          <Link className="empty-action" href="/app/integrations">
            {integrations !== null && integrations.length > 0 ? "Open integrations" : "Configure integration"}
            <ArrowRight aria-hidden="true" size={16} weight="bold" />
          </Link>
          <div className="boundary-note"><ShieldCheck aria-hidden="true" size={18} /><span>No custody, signing, or chain-write capability.</span></div>
        </aside>
      </section>
    </main>
  );
}

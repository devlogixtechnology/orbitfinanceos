import { CheckCircle, DownloadSimple, Gear, PlugsConnected, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { cookies } from "next/headers";
import Link from "next/link";

import { PendingSubmitButton } from "../../../components/pending-submit-button";
import { loadAuthorizedSession, loadDataConnections } from "../../../lib/session";
import { saveAutomationSettings } from "./actions";

export default async function SettingsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ saved?: string }>;
}>) {
  const [session, status, cookieStore] = await Promise.all([
    loadAuthorizedSession(),
    searchParams,
    cookies(),
  ]);

  const activeCustomerId = session?.actor.customerId;
  const connections = await loadDataConnections(activeCustomerId);
  const qbConnection = connections?.find((c) => c.provider === "quickbooks");

  const autoSyncEnabled = cookieStore.get("orbitos_auto_sync_qb")?.value === "true";
  const clearingAcct = cookieStore.get("orbitos_qb_clearing_acct")?.value ?? "12000 - Digital Assets Clearing";
  const varianceAcct = cookieStore.get("orbitos_qb_variance_acct")?.value ?? "50100 - Realized Variance & Adjustments";

  const companyName = session?.actor.customerDisplayName ?? session?.tenant.displayName ?? "Workspace";

  return (
    <main className="page control-page">
      <header className="page-header control-heading">
        <p className="eyebrow">Operational Governance</p>
        <h1>Workspace &amp; Automation Settings</h1>
        <p>Configure automated ledger sync, accounting exports, and workflow policies for {companyName}.</p>
      </header>

      {status.saved === "1" ? (
        <p className="success-alert" role="status">
          Automation settings saved successfully. New reconciliation runs will apply these policies automatically.
        </p>
      ) : null}

      <div className="control-split">
        <section className="control-panel form-panel">
          <div className="section-heading">
            <Gear size={20} />
            <p className="eyebrow">Accounting Sync</p>
            <h2>QuickBooks Online Automation</h2>
            <p>Automatically synchronize verified position balances and atomic roll-forwards directly to QuickBooks.</p>
          </div>

          <form action={saveAutomationSettings} className="configuration-form embedded-form">
            <div style={{
              background: "var(--color-surface-raised, rgba(255,255,255,0.03))",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              padding: "16px",
              marginBottom: "16px",
            }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer", margin: 0 }}>
                <input
                  defaultChecked={autoSyncEnabled}
                  name="autoSyncQuickbooks"
                  type="checkbox"
                  value="true"
                  style={{ marginTop: "4px", width: "18px", height: "18px", accentColor: "var(--color-accent)" }}
                />
                <div>
                  <strong style={{ display: "block", fontSize: "0.92rem", color: "var(--color-text-primary)" }}>
                    Auto-Push Matched Reconciliations to QuickBooks
                  </strong>
                  <span style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", lineHeight: 1.4, display: "block", marginTop: "4px" }}>
                    When enabled, any reconciliation with state &ldquo;matched&rdquo; (zero discrepancy) automatically generates and stages a balanced journal entry in QuickBooks Online without requiring manual clicking.
                  </span>
                </div>
              </label>
            </div>

            <label htmlFor="clearing-account">QuickBooks Asset / Clearing Account</label>
            <input
              defaultValue={clearingAcct}
              id="clearing-account"
              name="clearingAccount"
              placeholder="12000 - Digital Assets Clearing"
              required
            />
            <p className="form-help">General ledger asset account representing the verified custodial wallet balance.</p>

            <label htmlFor="variance-account">Variance &amp; Adjustment Account</label>
            <input
              defaultValue={varianceAcct}
              id="variance-account"
              name="varianceAccount"
              placeholder="50100 - Realized Variance & Adjustments"
              required
            />
            <p className="form-help">Expense or income offset account used for reconciliation rounding or gas adjustments.</p>

            <PendingSubmitButton className="primary-button" pendingLabel="Saving preferences...">
              Save Automation Preferences
            </PendingSubmitButton>
          </form>

          <div style={{ marginTop: "20px", padding: "14px", border: "1px solid var(--color-border)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <PlugsConnected size={20} color={qbConnection ? "var(--color-success)" : "var(--color-warning)"} />
              <div>
                <strong style={{ fontSize: "0.85rem", display: "block" }}>QuickBooks Integration Connection</strong>
                <span style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
                  {qbConnection ? `Connected: ${qbConnection.displayName}` : "No QuickBooks connection active"}
                </span>
              </div>
            </div>
            <Link href="/app/integrations" className="secondary-button" style={{ padding: "6px 12px", fontSize: "12px", textDecoration: "none" }}>
              {qbConnection ? "Configure" : "Connect"}
            </Link>
          </div>
        </section>

        <aside className="control-panel">
          <div className="section-heading">
            <DownloadSimple size={20} />
            <p className="eyebrow">Reports &amp; Data</p>
            <h2>Reconciliation Export</h2>
            <p>Download complete audit logs and reconciled balances as standardized spreadsheet data.</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <p style={{ fontSize: "0.88rem", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              Export all historic position reconciliations, atomic ledger roll-forwards, exception flags, and customer assignments in UTF-8 CSV format.
            </p>
            <div>
              <a
                href={`/api/export-reconciliations${activeCustomerId ? `?customerId=${activeCustomerId}` : ""}`}
                className="primary-button"
                style={{ display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none" }}
              >
                <DownloadSimple size={18} />
                Download Reconciliations CSV
              </a>
            </div>
          </div>

          <div className="security-note" style={{ marginTop: "24px" }}>
            <ShieldCheck size={20} />
            <div>
              <strong>Cryptographic Evidence Preservation</strong>
              <p>Every imported CSV and reconciled record is hashed with SHA-256 for mathematical non-repudiation during statutory audits.</p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

import { Key, Storefront } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { PendingSubmitButton } from "../../../components/pending-submit-button";
import { loadAuthorizedSession, loadControlPlane } from "../../../lib/session";
import { createCustomer, resetCustomerPasswordAction } from "../control-plane-actions";

export default async function CustomersPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ created?: string; error?: string; reset?: string }> }>) {
  const [session, snapshot, status] = await Promise.all([loadAuthorizedSession(), loadControlPlane(), searchParams]);
  const isPlatform = session?.roles.includes("super_admin") ?? false;
  const canWrite = session?.permissions.includes("customers:write") ?? false;
  const tenantName = new Map(snapshot?.tenants.map((tenant) => [tenant.tenantId, tenant.displayName]));

  return (
    <main className="page control-page">
      <header className="page-header control-heading">
        <p className="eyebrow">Second-level SaaS</p>
        <h1>Customer workspaces</h1>
        <p>Companies onboard and manage their own customers here. Every customer remains inside its parent workspace boundary.</p>
      </header>
      {status.created === "1" ? <p className="success-alert">Customer workspace created.</p> : null}
      {status.reset === "1" ? <p className="success-alert">Customer password reset successfully.</p> : null}
      {status.error === "password-invalid" ? <p className="form-error">Password must be at least 12 characters.</p> : null}
      {status.error === "reset-failed" ? <p className="form-error">Failed to reset customer password.</p> : null}
      {status.error === "invalid" ? <p className="form-error">The customer could not be created. Verify the reference is unique.</p> : null}

      <div className="control-split reverse-control-split">
        <aside className="control-panel form-panel">
          <div className="section-heading"><p className="eyebrow">Onboard</p><h2>New customer</h2></div>
          {canWrite ? (
            <form action={createCustomer} className="configuration-form embedded-form">
              {isPlatform ? <><label htmlFor="customer-tenant">Parent company</label><select id="customer-tenant" name="tenantId" required><option value="">Select company</option>{snapshot?.tenants.map((tenant) => <option key={tenant.tenantId} value={tenant.tenantId}>{tenant.displayName}</option>)}</select></> : null}
              <label htmlFor="customer-name">Customer name</label>
              <input id="customer-name" name="displayName" placeholder="Northstar Trading" required />
              <label htmlFor="customer-reference">Customer reference</label>
              <input id="customer-reference" name="externalReference" placeholder="CUS-001" required />
              <label htmlFor="customer-email">Customer login email</label>
              <input id="customer-email" name="email" type="email" placeholder="finance@customer.com" required />
              <label htmlFor="customer-password">Customer temporary password (min 12 chars)</label>
              <input id="customer-password" name="temporaryPassword" type="password" minLength={12} placeholder="At least 12 characters" required />
              <p className="form-help">Creates login credentials so the customer can access their workspace dashboard, connect Fireblocks &amp; QuickBooks, and view live reconciliations.</p>
              <PendingSubmitButton className="primary-button" pendingLabel="Creating customer & credentials">Create customer &amp; login</PendingSubmitButton>
            </form>
          ) : <div className="inline-alert"><strong>Read-only access</strong>Your role cannot create customer workspaces.</div>}
        </aside>

        <section className="control-panel">
          <div className="section-heading"><p className="eyebrow">Managed portfolio</p><h2>Customers</h2></div>
          {snapshot === null ? <div className="inline-alert"><strong>Customer service unavailable</strong>Try again after the API recovers.</div> : snapshot.customers.length === 0 ? (
            <div className="empty-state"><Storefront size={26} /><strong>No customers yet</strong><span>Onboard the first end-customer workspace.</span></div>
          ) : (
            <div className="table-scroll">
              <table className="control-table">
                <thead>
                  <tr>
                    <th>Customer & Login</th>
                    {isPlatform ? <th>Company</th> : null}
                    <th>Reference</th>
                    <th>Billing</th>
                    <th>Status</th>
                    {canWrite ? <th>Management Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {snapshot.customers.map((customer) => {
                    const subscription = snapshot.subscriptions.find((item) => item.customerId === customer.customerId && item.status !== "cancelled");
                    return (
                      <tr key={customer.customerId}>
                        <td>
                          <strong>{customer.displayName}</strong>
                          <span className="table-subline">{customer.email ? `Login: ${customer.email}` : "Created " + new Date(customer.createdAt).toLocaleDateString()}</span>
                        </td>
                        {isPlatform ? <td>{tenantName.get(customer.tenantId)}</td> : null}
                        <td className="mono-value">{customer.externalReference}</td>
                        <td>
                          {subscription ? (
                            <>
                              <strong>{subscription.planName}</strong>
                              <span className="table-subline">{subscription.interval}</span>
                            </>
                          ) : (
                            <span className="muted-copy">Not configured</span>
                          )}
                        </td>
                        <td>
                          <span className={`status-pill status-${customer.status}`}>{customer.status}</span>
                        </td>
                        {canWrite ? (
                          <td>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "flex-start" }}>
                              <details className="action-details-popover">
                                <summary className="secondary-button" style={{ fontSize: "0.74rem", padding: "4px 8px", cursor: "pointer" }}>
                                  View Info
                                </summary>
                                <div style={{
                                  position: "absolute",
                                  zIndex: 30,
                                  marginTop: "6px",
                                  padding: "14px",
                                  width: "280px",
                                  background: "var(--color-surface)",
                                  border: "1px solid var(--color-border-strong)",
                                  borderRadius: "8px",
                                  boxShadow: "0 8px 24px var(--color-shadow)",
                                  display: "grid",
                                  gap: "8px",
                                  fontSize: "0.78rem"
                                }}>
                                  <div><strong style={{ display: "block", color: "var(--color-text-secondary)", fontSize: "0.7rem" }}>CUSTOMER ID</strong><span className="mono-value" style={{ wordBreak: "break-all" }}>{customer.customerId}</span></div>
                                  <div><strong style={{ display: "block", color: "var(--color-text-secondary)", fontSize: "0.7rem" }}>EXTERNAL REF</strong><span>{customer.externalReference}</span></div>
                                  <div><strong style={{ display: "block", color: "var(--color-text-secondary)", fontSize: "0.7rem" }}>LOGIN USERNAME</strong><span>{customer.email ?? "No email set"}</span></div>
                                  <div><strong style={{ display: "block", color: "var(--color-text-secondary)", fontSize: "0.7rem" }}>ONBOARDED DATE</strong><span>{new Date(customer.createdAt).toLocaleString()}</span></div>
                                  <hr style={{ borderColor: "var(--color-border)", margin: "4px 0" }} />
                                  <div style={{ display: "flex", gap: "10px" }}>
                                    <Link href={`/app/integrations?customerId=${customer.customerId}`} style={{ color: "var(--color-accent)", textDecoration: "underline", fontWeight: 600 }}>Sources</Link>
                                    <Link href={`/app/reconciliation?customerId=${customer.customerId}`} style={{ color: "var(--color-accent)", textDecoration: "underline", fontWeight: 600 }}>Reconciliations</Link>
                                  </div>
                                </div>
                              </details>

                              <details className="action-details-popover">
                                <summary className="secondary-button" style={{ fontSize: "0.74rem", padding: "4px 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                  <Key size={13} /> Reset Pwd
                                </summary>
                                <form action={resetCustomerPasswordAction} style={{
                                  position: "absolute",
                                  zIndex: 30,
                                  marginTop: "6px",
                                  padding: "14px",
                                  width: "280px",
                                  background: "var(--color-surface)",
                                  border: "1px solid var(--color-border-strong)",
                                  borderRadius: "8px",
                                  boxShadow: "0 8px 24px var(--color-shadow)",
                                  display: "grid",
                                  gap: "8px",
                                  fontSize: "0.78rem"
                                }}>
                                  <input type="hidden" name="customerId" value={customer.customerId} />
                                  <strong style={{ color: "var(--color-text-primary)", fontSize: "0.82rem" }}>Reset Login Credentials</strong>
                                  <label style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>New Password (min 12 chars)</label>
                                  <input name="newPassword" type="password" minLength={12} placeholder="Enter 12+ characters" required style={{
                                    fontSize: "0.8rem",
                                    padding: "6px 8px",
                                    background: "var(--color-canvas)",
                                    border: "1px solid var(--color-border-strong)",
                                    borderRadius: "4px",
                                    color: "var(--color-text-primary)"
                                  }} />
                                  <label style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>Update Email (optional)</label>
                                  <input name="email" type="email" defaultValue={customer.email ?? ""} style={{
                                    fontSize: "0.8rem",
                                    padding: "6px 8px",
                                    background: "var(--color-canvas)",
                                    border: "1px solid var(--color-border-strong)",
                                    borderRadius: "4px",
                                    color: "var(--color-text-primary)"
                                  }} />
                                  <PendingSubmitButton className="primary-button" pendingLabel="Saving..." style={{ fontSize: "0.75rem", padding: "6px 10px", marginTop: "4px" }}>
                                    Update Password
                                  </PendingSubmitButton>
                                </form>
                              </details>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}


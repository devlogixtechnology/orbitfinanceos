import { CreditCard, Receipt, Scales } from "@phosphor-icons/react/dist/ssr";

import { PendingSubmitButton } from "../../../components/pending-submit-button";
import { loadAuthorizedSession, loadControlPlane } from "../../../lib/session";
import { createInvoice, createSubscription } from "../control-plane-actions";

function exactAmount(currency: string, amountMinor: string): string {
  return `${currency} ${BigInt(amountMinor).toLocaleString()} minor units`;
}

export default async function BillingPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ created?: string; error?: string }> }>) {
  const [session, snapshot, status] = await Promise.all([loadAuthorizedSession(), loadControlPlane(), searchParams]);
  const isPlatform = session?.roles.includes("super_admin") ?? false;
  const canWrite = session?.permissions.includes("billing:write") ?? false;
  const tenantName = new Map(snapshot?.tenants.map((tenant) => [tenant.tenantId, tenant.displayName]));
  const customerName = new Map(snapshot?.customers.map((customer) => [customer.customerId, customer.displayName]));

  return (
    <main className="page control-page">
      <header className="page-header control-heading"><p className="eyebrow">Two-sided commerce</p><h1>Billing control</h1><p>OrbitOS bills reseller companies; each company separately prices and invoices its own customers. Amounts are stored as exact integer minor units.</p></header>
      {status.created === "1" ? <p className="success-alert">Billing record created.</p> : null}
      {status.error !== undefined ? <p className="form-error">The billing record was rejected. Verify the company, customer, dates, and exact amount.</p> : null}

      <section className="billing-lanes">
        <article><span className="lane-icon platform-lane"><Scales size={22} /></span><div><p className="eyebrow">Platform billing</p><h2>OrbitOS → Company</h2><p>Commercial relationship controlled only by Super Admin.</p></div></article>
        <span className="lane-divider">and</span>
        <article><span className="lane-icon tenant-lane"><CreditCard size={22} /></span><div><p className="eyebrow">Reseller billing</p><h2>Company → Customer</h2><p>Pricing and collection remain under the reseller company.</p></div></article>
      </section>

      {canWrite ? <div className="access-forms billing-forms">
        <section className="control-panel form-panel"><div className="section-heading"><p className="eyebrow">Recurring commercial terms</p><h2>New subscription</h2></div><form action={createSubscription} className="configuration-form embedded-form">
          {isPlatform ? <><label htmlFor="subscription-tenant">Company</label><select id="subscription-tenant" name="tenantId" required><option value="">Select company</option>{snapshot?.tenants.map((tenant) => <option key={tenant.tenantId} value={tenant.tenantId}>{tenant.displayName}</option>)}</select></> : null}
          <label htmlFor="subscription-kind">Billing relationship</label><select defaultValue={isPlatform ? "platform_to_tenant" : "tenant_to_customer"} id="subscription-kind" name="billingKind">{isPlatform ? <option value="platform_to_tenant">OrbitOS to company</option> : null}<option value="tenant_to_customer">Company to customer</option></select>
          <label htmlFor="subscription-customer">Customer (required for customer billing)</label><select id="subscription-customer" name="customerId"><option value="">No customer — company subscription</option>{snapshot?.customers.map((customer) => <option key={customer.customerId} value={customer.customerId}>{customer.displayName}{isPlatform ? ` — ${tenantName.get(customer.tenantId)}` : ""}</option>)}</select>
          <div className="form-row"><div><label htmlFor="plan-code">Plan code</label><input id="plan-code" name="planCode" placeholder="growth_monthly" required /></div><div><label htmlFor="plan-name">Plan name</label><input id="plan-name" name="planName" placeholder="Growth" required /></div></div>
          <div className="form-row"><div><label htmlFor="subscription-amount">Amount (minor units)</label><input id="subscription-amount" inputMode="numeric" name="amountMinor" pattern="[0-9]+" placeholder="25000" required /></div><div><label htmlFor="subscription-currency">Currency</label><input defaultValue="USD" id="subscription-currency" maxLength={3} minLength={3} name="currency" required /></div></div>
          <div className="form-row"><div><label htmlFor="subscription-interval">Interval</label><select id="subscription-interval" name="interval"><option value="monthly">Monthly</option><option value="annual">Annual</option></select></div><div><label htmlFor="subscription-status">Status</label><select id="subscription-status" name="status"><option value="trialing">Trialing</option><option value="active">Active</option><option value="paused">Paused</option></select></div></div>
          <label htmlFor="next-billing-at">Next billing date</label><input id="next-billing-at" name="nextBillingAt" type="datetime-local" />
          <PendingSubmitButton className="primary-button" pendingLabel="Creating subscription">Create subscription</PendingSubmitButton>
        </form></section>

        <section className="control-panel form-panel"><div className="section-heading"><p className="eyebrow">Accounts receivable</p><h2>Issue invoice</h2></div><form action={createInvoice} className="configuration-form embedded-form">
          {isPlatform ? <><label htmlFor="invoice-tenant">Company</label><select id="invoice-tenant" name="tenantId" required><option value="">Select company</option>{snapshot?.tenants.map((tenant) => <option key={tenant.tenantId} value={tenant.tenantId}>{tenant.displayName}</option>)}</select></> : null}
          <label htmlFor="invoice-kind">Billing relationship</label><select defaultValue={isPlatform ? "platform_to_tenant" : "tenant_to_customer"} id="invoice-kind" name="billingKind">{isPlatform ? <option value="platform_to_tenant">OrbitOS to company</option> : null}<option value="tenant_to_customer">Company to customer</option></select>
          <label htmlFor="invoice-customer">Customer (required for customer billing)</label><select id="invoice-customer" name="customerId"><option value="">No customer — company invoice</option>{snapshot?.customers.map((customer) => <option key={customer.customerId} value={customer.customerId}>{customer.displayName}{isPlatform ? ` — ${tenantName.get(customer.tenantId)}` : ""}</option>)}</select>
          <label htmlFor="invoice-number">Invoice number</label><input id="invoice-number" name="invoiceNumber" placeholder="INV-2026-001" required />
          <div className="form-row"><div><label htmlFor="invoice-amount">Amount (minor units)</label><input id="invoice-amount" inputMode="numeric" name="amountDueMinor" pattern="[0-9]+" required /></div><div><label htmlFor="invoice-currency">Currency</label><input defaultValue="USD" id="invoice-currency" maxLength={3} minLength={3} name="currency" required /></div></div>
          <label htmlFor="invoice-due-at">Due date</label><input id="invoice-due-at" name="dueAt" required type="datetime-local" />
          <PendingSubmitButton className="primary-button" pendingLabel="Issuing invoice">Issue invoice</PendingSubmitButton>
        </form></section>
      </div> : <div className="inline-alert"><strong>Read-only billing view</strong>Your role cannot change commercial records.</div>}

      <div className="control-split billing-lists">
        <section className="control-panel"><div className="section-heading"><CreditCard size={20} /><p className="eyebrow">Recurring</p><h2>Subscriptions</h2></div>{snapshot === null ? <div className="inline-alert">Billing unavailable.</div> : snapshot.subscriptions.length === 0 ? <div className="empty-state"><strong>No subscriptions</strong></div> : <div className="record-stack">{snapshot.subscriptions.map((item) => <article key={item.subscriptionId}><div><strong>{item.planName}</strong><span>{item.billingKind === "platform_to_tenant" ? tenantName.get(item.tenantId) : customerName.get(item.customerId ?? "")}</span></div><div className="record-amount"><strong>{exactAmount(item.currency, item.amountMinor)}</strong><span>{item.interval}</span></div><span className={`status-pill status-${item.status}`}>{item.status}</span></article>)}</div>}</section>
        <section className="control-panel"><div className="section-heading"><Receipt size={20} /><p className="eyebrow">Receivables</p><h2>Invoices</h2></div>{snapshot === null ? <div className="inline-alert">Billing unavailable.</div> : snapshot.invoices.length === 0 ? <div className="empty-state"><strong>No invoices</strong></div> : <div className="record-stack">{snapshot.invoices.map((item) => <article key={item.invoiceId}><div><strong>{item.invoiceNumber}</strong><span>{item.billingKind === "platform_to_tenant" ? tenantName.get(item.tenantId) : customerName.get(item.customerId ?? "")}</span></div><div className="record-amount"><strong>{exactAmount(item.currency, item.amountDueMinor)}</strong><span>Due {new Date(item.dueAt).toLocaleDateString()}</span></div><span className={`status-pill status-${item.status}`}>{item.status}</span></article>)}</div>}</section>
      </div>
    </main>
  );
}

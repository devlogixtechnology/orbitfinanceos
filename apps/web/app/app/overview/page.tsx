import { ArrowRight, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

export default function OverviewPage() {
  return (
    <main className="page">
      <header className="page-header">
        <h1>Operational overview</h1>
        <p>
          Start with a read-only BNB Smart Chain integration. Evidence and tenant controls remain visible throughout the workflow.
        </p>
      </header>

      <section aria-label="Current operational state" className="summary-surface">
        <div className="summary-item">
          <h2>No integration configured</h2>
          <p>
            Add allowlisted wallets and token contracts after the provider and secret references are approved.
          </p>
          <Link className="empty-action" href="/app/integrations">
            View integrations
            <ArrowRight aria-hidden="true" size={16} weight="bold" />
          </Link>
        </div>
        <div className="summary-item">
          <h2>Custody-neutral by design</h2>
          <p>
            OrbitOS reads public chain evidence. It does not hold keys, sign transactions, or submit transfers.
          </p>
          <ShieldCheck
            aria-label="Read-only custody boundary"
            color="var(--color-success)"
            size={24}
            weight="regular"
          />
        </div>
      </section>
    </main>
  );
}

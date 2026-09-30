import { Database, Fingerprint, LockKey, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";

import { signIn } from "./actions";

const errorMessages: Readonly<Record<string, string>> = {
  invalid: "The email address or password is incorrect. Please try again.",
  unavailable: "Sign-in is temporarily unavailable. Please try again shortly.",
};

export default async function SignInPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string }> }>) {
  const error = (await searchParams).error;
  return (
    <main className="sign-in-page">
      <section aria-labelledby="sign-in-heading" className="sign-in-shell">
        <aside className="sign-in-story">
          <div className="sign-in-brand">
            <Image
              alt="OrbitOS"
              height={64}
              priority
              src="/brand/orbitos-logo-horizontal-dark.svg"
              width={261}
            />
          </div>
          <div className="sign-in-story-copy">
            <p className="eyebrow">Evidence-backed asset operations</p>
            <h2>Financial control starts with facts you can trace.</h2>
            <p>
              Reconcile read-only digital-asset activity with exact quantities,
              independent verification, and durable evidence lineage.
            </p>
          </div>
          <ul className="trust-list">
            <li><ShieldCheck aria-hidden="true" size={20} />Custody-neutral by design</li>
            <li><Database aria-hidden="true" size={20} />Tenant-isolated records</li>
            <li><Fingerprint aria-hidden="true" size={20} />Auditable operator actions</li>
          </ul>
          <div className="environment-banner"><span className="environment-dot" />Secure staging environment</div>
        </aside>

        <div className="sign-in-panel">
          <div className="sign-in-icon"><LockKey aria-hidden="true" size={22} weight="regular" /></div>
          <p className="eyebrow">Authorized access</p>
          <h1 id="sign-in-heading">Sign in to OrbitOS</h1>
          <p>
            Continue to your approved tenant workspace. Credentials are exchanged server-to-server and never exposed to the browser session.
          </p>
          {error !== undefined && errorMessages[error] !== undefined ? (
            <p className="form-error" role="alert">{errorMessages[error]}</p>
          ) : null}
          <form action={signIn} className="auth-form">
            <label htmlFor="email">Email address</label>
            <input autoComplete="username" defaultValue="orbitos@devlogix.com.pk" id="email" name="email" required type="email" />
            <label htmlFor="password">Password</label>
            <input autoComplete="current-password" id="password" minLength={12} name="password" required type="password" />
            <button className="primary-button" type="submit">Sign in</button>
          </form>
          <p className="sign-in-support">Access issues? Contact your OrbitOS workspace administrator.</p>
        </div>
      </section>
    </main>
  );
}

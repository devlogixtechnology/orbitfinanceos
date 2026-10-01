import type { SessionContext } from "@orbitos/canonical-model";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";

import { signOut } from "../app/app/actions";
import { PendingSubmitButton } from "./pending-submit-button";
import { PrimaryNavigation } from "./primary-navigation";
import { ThemeSelector } from "./theme-selector";

function displayActor(subject: string): string {
  return subject.startsWith("password:") ? subject.slice("password:".length) : subject;
}

export function ApplicationShell({
  children,
  initialTheme,
  session,
}: Readonly<{
  children: React.ReactNode;
  initialTheme: "system" | "light" | "dark";
  session: SessionContext;
}>) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/app/overview">
          <span aria-label="OrbitOS" className="brand-logo-pair" role="img">
            <Image
              alt=""
              aria-hidden="true"
              className="brand-logo brand-logo-light"
              height={64}
              priority
              src="/brand/orbitos-logo-horizontal-light.svg"
              width={261}
            />
            <Image
              alt=""
              aria-hidden="true"
              className="brand-logo brand-logo-dark"
              height={64}
              priority
              src="/brand/orbitos-logo-horizontal-dark.svg"
              width={261}
            />
          </span>
          <span className="environment-label">Staging</span>
        </Link>

        <div style={{ padding: "10px 16px", margin: "4px 16px 16px", background: "var(--color-accent-soft)", borderRadius: "8px", border: "1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)" }}>
          <span style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-accent)", fontWeight: 700, display: "block" }}>Company</span>
          <strong style={{ fontSize: "0.92rem", color: "var(--color-text-primary)", wordBreak: "break-word", display: "block" }}>{session.tenant.displayName}</strong>
          {session.actor.customerId ? (
            <span style={{ display: "inline-block", marginTop: "4px", fontSize: "0.68rem", background: "var(--color-analytic-soft)", color: "var(--color-analytic)", padding: "1px 6px", borderRadius: "4px", fontWeight: 600 }}>
              Customer Portal
            </span>
          ) : null}
        </div>

        <PrimaryNavigation permissions={session.permissions} />

        <div className="sidebar-foot">
          <p className="tenant-name">{session.tenant.displayName}</p>
          <p className="tenant-role">{session.roles.join(", ")}</p>
          <ThemeSelector initialTheme={initialTheme} />
          <form action={signOut}>
            <PendingSubmitButton
              className="secondary-button sign-out-button"
              pendingLabel="Signing out"
            >
              Sign out
            </PendingSubmitButton>
          </form>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-context">
            <span className="environment-dot" />
            <strong style={{ fontSize: "0.92rem", color: "var(--color-text-primary)", fontWeight: 700 }}>
              {session.tenant.displayName}
            </strong>
            <span aria-hidden="true" className="topbar-divider">/</span>
            <span style={{ color: "var(--color-text-secondary)", fontSize: "0.82rem" }}>
              {session.roles.includes("super_admin") ? "Platform authority" : session.actor.customerId ? "Customer Portal" : "Workspace Control"}
            </span>
          </div>
          <div className="topbar-identity">
            <CheckCircle aria-hidden="true" color="var(--color-success)" size={18} weight="fill" />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.25 }}>
              <span className="topbar-actor" style={{ fontWeight: 600 }}>{displayActor(session.actor.subject)}</span>
              <span style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>{session.tenant.displayName}</span>
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

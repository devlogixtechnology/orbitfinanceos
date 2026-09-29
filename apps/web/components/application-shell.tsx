import type { SessionContext } from "@orbitos/canonical-model";
import { ArrowsLeftRight, Gauge, PlugsConnected, Scales, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { signOut } from "../app/app/actions";
import { ThemeSelector } from "./theme-selector";

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
          <span aria-hidden="true" className="brand-mark">O</span>
          <span>OrbitOS</span>
          <span className="environment-label">MVP</span>
        </Link>

        <nav aria-label="Primary" className="primary-nav">
          <Link className="nav-link" href="/app/overview">
            <Gauge aria-hidden="true" size={20} weight="regular" />
            Overview
          </Link>
          <Link className="nav-link" href="/app/integrations">
            <PlugsConnected aria-hidden="true" size={20} weight="regular" />
            Integrations
          </Link>
          <Link className="nav-link" href="/app/movements">
            <ArrowsLeftRight aria-hidden="true" size={20} weight="regular" />
            Movements
          </Link>
          <Link className="nav-link" href="/app/reconciliation">
            <Scales aria-hidden="true" size={20} weight="regular" />
            Reconciliation
          </Link>
          <Link className="nav-link" href="/app/exceptions">
            <WarningCircle aria-hidden="true" size={20} weight="regular" />
            Exceptions
          </Link>
        </nav>

        <div className="sidebar-foot">
          <p className="tenant-name">{session.tenant.displayName}</p>
          <p className="tenant-role">{session.roles.join(", ")}</p>
          <ThemeSelector initialTheme={initialTheme} />
          <form action={signOut}>
            <button className="secondary-button sign-out-button" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <span className="topbar-context">Authorized tenant context</span>
          <span className="topbar-actor">{session.actor.subject}</span>
        </header>
        {children}
      </div>
    </div>
  );
}

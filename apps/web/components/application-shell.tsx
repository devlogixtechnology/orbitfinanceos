import type { SessionContext } from "@orbitos/canonical-model";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";

import { signOut } from "../app/app/actions";
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

        <PrimaryNavigation />

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
          <div className="topbar-context">
            <span className="environment-dot" />
            <span>Staging workspace</span>
            <span aria-hidden="true" className="topbar-divider">/</span>
            <strong>Tenant workspace</strong>
          </div>
          <div className="topbar-identity">
            <CheckCircle aria-hidden="true" color="var(--color-success)" size={18} weight="fill" />
            <span className="topbar-actor">{displayActor(session.actor.subject)}</span>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

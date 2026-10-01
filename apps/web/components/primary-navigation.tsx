"use client";

import {
  ArrowsLeftRight,
  Buildings,
  CreditCard,
  Gauge,
  Gear,
  Globe,
  IdentificationCard,
  PlugsConnected,
  Scales,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navigationItems = [
  { group: "Operate", href: "/app/overview", icon: Gauge, label: "Overview" },
  { group: "Operate", href: "/app/integrations", icon: PlugsConnected, label: "Integrations" },
  { group: "Operate", href: "/app/movements", icon: ArrowsLeftRight, label: "Movements" },
  { group: "Operate", href: "/app/reconciliation", icon: Scales, label: "Reconciliation" },
  { group: "Operate", href: "/app/exceptions", icon: WarningCircle, label: "Exceptions" },
  { group: "Operate", href: "/app/settings", icon: Gear, label: "Settings" },
  { group: "Administer", href: "/app/platform", icon: Buildings, label: "Companies", permission: "platform:tenants:read" },
  { group: "Administer", href: "/app/customers", icon: UsersThree, label: "Customers", permission: "customers:read" },
  { group: "Administer", href: "/app/access", icon: IdentificationCard, label: "Users & roles", permission: "users:read" },
  { group: "Administer", href: "/app/domains", icon: Globe, label: "Domains", permission: "domains:read" },
  { group: "Administer", href: "/app/billing", icon: CreditCard, label: "Billing", permission: "billing:read" },
] as const;

export function PrimaryNavigation({ permissions }: Readonly<{ permissions: readonly string[] }>) {
  const pathname = usePathname() ?? "";
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    if (pendingHref === null) return;
    const timeout = window.setTimeout(() => setPendingHref(null), 5_000);
    return () => window.clearTimeout(timeout);
  }, [pendingHref]);
  const visibleItems = navigationItems.filter(
    (item) => !("permission" in item) || permissions.includes(item.permission),
  );
  let previousGroup = "";

  return (
    <nav aria-busy={pendingHref !== null} aria-label="Primary" className="primary-nav">
      {pendingHref !== null ? <span aria-live="polite" className="route-progress"><span className="route-progress-bar" />Loading workspace</span> : null}
      {visibleItems.map(({ group, href, icon: Icon, label }) => {
        const isCurrent = pathname === href || pathname.startsWith(`${href}/`);
        const showGroup = group !== previousGroup;
        previousGroup = group;
        return (
          <div className="nav-entry" key={href}>
            {showGroup ? <p className="nav-group-label">{group}</p> : null}
            <Link
              aria-current={isCurrent ? "page" : undefined}
              className="nav-link"
              href={href}
              onClick={() => setPendingHref(href)}
            >
              <Icon aria-hidden="true" size={20} weight={isCurrent ? "fill" : "regular"} />
              <span>{label}</span>
              {pendingHref === href ? <span aria-hidden="true" className="nav-spinner" /> : null}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

"use client";

import {
  ArrowsLeftRight,
  Buildings,
  CreditCard,
  Gauge,
  Globe,
  IdentificationCard,
  PlugsConnected,
  Scales,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  { group: "Operate", href: "/app/overview", icon: Gauge, label: "Overview" },
  { group: "Operate", href: "/app/integrations", icon: PlugsConnected, label: "Integrations" },
  { group: "Operate", href: "/app/movements", icon: ArrowsLeftRight, label: "Movements" },
  { group: "Operate", href: "/app/reconciliation", icon: Scales, label: "Reconciliation" },
  { group: "Operate", href: "/app/exceptions", icon: WarningCircle, label: "Exceptions" },
  { group: "Administer", href: "/app/platform", icon: Buildings, label: "Tenants", permission: "platform:tenants:read" },
  { group: "Administer", href: "/app/customers", icon: UsersThree, label: "Customers", permission: "customers:read" },
  { group: "Administer", href: "/app/access", icon: IdentificationCard, label: "Users & roles", permission: "users:read" },
  { group: "Administer", href: "/app/domains", icon: Globe, label: "Domains", permission: "domains:read" },
  { group: "Administer", href: "/app/billing", icon: CreditCard, label: "Billing", permission: "billing:read" },
] as const;

export function PrimaryNavigation({ permissions }: Readonly<{ permissions: readonly string[] }>) {
  const pathname = usePathname() ?? "";
  const visibleItems = navigationItems.filter(
    (item) => !("permission" in item) || permissions.includes(item.permission),
  );
  let previousGroup = "";

  return (
    <nav aria-label="Primary" className="primary-nav">
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
            >
              <Icon aria-hidden="true" size={20} weight={isCurrent ? "fill" : "regular"} />
              <span>{label}</span>
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

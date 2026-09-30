"use client";

import {
  ArrowsLeftRight,
  Gauge,
  PlugsConnected,
  Scales,
  WarningCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  { href: "/app/overview", icon: Gauge, label: "Overview" },
  { href: "/app/integrations", icon: PlugsConnected, label: "Integrations" },
  { href: "/app/movements", icon: ArrowsLeftRight, label: "Movements" },
  { href: "/app/reconciliation", icon: Scales, label: "Reconciliation" },
  { href: "/app/exceptions", icon: WarningCircle, label: "Exceptions" },
] as const;

export function PrimaryNavigation() {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Primary" className="primary-nav">
      {navigationItems.map(({ href, icon: Icon, label }) => {
        const isCurrent = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            aria-current={isCurrent ? "page" : undefined}
            className="nav-link"
            href={href}
            key={href}
          >
            <Icon aria-hidden="true" size={20} weight={isCurrent ? "fill" : "regular"} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

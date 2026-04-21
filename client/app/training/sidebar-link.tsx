"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarLinkProps {
  href: string;
  label: string;
  badge?: string;
  badgeHint?: string;
}

export function SidebarLink({
  href,
  label,
  badge,
  badgeHint,
}: SidebarLinkProps) {
  const pathname = usePathname();
  const isActive =
    pathname === href ||
    (href !== "/training" && pathname?.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
        isActive
          ? "bg-accent-soft text-accent font-medium"
          : "text-foreground/75 hover:bg-surface-muted hover:text-foreground"
      }`}
    >
      <span>{label}</span>
      {badge ? (
        <span
          title={badgeHint}
          className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-mono text-foreground/60"
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

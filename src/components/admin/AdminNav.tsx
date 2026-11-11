"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; exact?: boolean; badge?: number };

export function AdminNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Quản trị" className="flex gap-1.5 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
      {items.map((i) => {
        const active = i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/");
        return (
          <Link
            key={i.href} href={i.href} aria-current={active ? "page" : undefined}
            className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
              active ? "bg-accent font-medium text-accent-fg shadow-sm" : "text-muted hover:bg-card hover:text-fg"
            }`}
          >
            {i.label}
            {!!i.badge && <span className="rounded-full bg-gold px-2 text-xs font-medium text-navy-deep">{i.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

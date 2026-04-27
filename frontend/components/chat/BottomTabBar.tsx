"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageCircle,
  Search,
  Users,
  User as UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface TabItem {
  href: string;
  label: string;
  icon: React.ElementType;
  matcher: (pathname: string) => boolean;
}

const TABS: TabItem[] = [
  {
    href: "/chat",
    label: "Chats",
    icon: MessageCircle,
    matcher: (p) => p === "/chat" || p.startsWith("/chat/"),
  },
  {
    href: "/search",
    label: "Search",
    icon: Search,
    matcher: (p) => p.startsWith("/search"),
  },
  {
    href: "/groups",
    label: "Groups",
    icon: Users,
    matcher: (p) => p.startsWith("/groups"),
  },
  {
    href: "/settings",
    label: "Profile",
    icon: UserIcon,
    matcher: (p) => p.startsWith("/settings"),
  },
];

/**
 * Mobile bottom tab bar. Hidden on `md+`. `pb-safe` ensures the iOS home
 * indicator does not overlap the tap targets. All targets are ≥44×44.
 */
export function BottomTabBar() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Primary navigation"
      className={cn(
        "md:hidden fixed inset-x-0 bottom-0 z-30",
        "bg-bg-elevated border-t border-border pb-safe",
      )}
    >
      <ul className="flex items-stretch justify-around">
        {TABS.map(({ href, label, icon: Icon, matcher }) => {
          const active = matcher(pathname);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                prefetch={false}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center min-h-14 py-2",
                  "text-xs font-medium",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  active ? "text-primary" : "text-text-muted",
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="mt-0.5">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

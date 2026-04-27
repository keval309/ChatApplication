"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageCircle,
  Search,
  Users,
  Settings as SettingsIcon,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { extractErrorMessage, useLogout, useMe } from "@/hooks/useAuth";
import { toast } from "@/components/ui/Toaster";
import { Avatar } from "./Avatar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/chat", label: "Chats", icon: MessageCircle },
  { href: "/search", label: "Search", icon: Search },
  { href: "/groups", label: "Groups", icon: Users },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/chat") return pathname === "/chat" || pathname.startsWith("/chat/");
  return pathname.startsWith(href);
}

/**
 * Desktop nav rail (64px). Hidden on mobile (BottomTabBar takes over).
 */
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useMe();
  const logout = useLogout();

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col items-center w-16 shrink-0",
        "bg-bg-elevated border-r border-border py-3",
      )}
      aria-label="Primary navigation"
    >
      <div className="mb-3" aria-hidden>
        <span className="inline-block h-9 w-9 rounded-xl bg-primary" />
      </div>

      <nav className="flex flex-col gap-1 flex-1 w-full items-center">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              prefetch={false}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "h-11 w-11 grid place-items-center rounded-xl",
                "transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                active
                  ? "bg-primary text-text-inverse"
                  : "text-text-muted hover:bg-bg-subtle hover:text-text",
              )}
            >
              <Icon className="h-5 w-5" />
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col items-center gap-1 mt-3">
        <ThemeToggle />
        <Link
          href="/settings"
          aria-label="Settings"
          className={cn(
            "h-11 w-11 grid place-items-center rounded-xl",
            "text-text-muted hover:bg-bg-subtle hover:text-text",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          )}
        >
          <SettingsIcon className="h-5 w-5" />
        </Link>
        <button
          type="button"
          aria-label="Sign out"
          onClick={async () => {
            try {
              await logout.mutateAsync();
              router.replace("/login");
            } catch (err) {
              toast.error(extractErrorMessage(err));
            }
          }}
          className={cn(
            "h-11 w-11 grid place-items-center rounded-xl",
            "text-text-muted hover:bg-bg-subtle hover:text-text",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          )}
        >
          <LogOut className="h-5 w-5" />
        </button>
        <Link
          href="/settings"
          aria-label="Profile"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Avatar
            src={me?.avatarUrl ?? null}
            alt={me?.displayName ?? me?.email ?? "Profile"}
            size={32}
            fallbackChar={(me?.displayName ?? me?.email ?? "?").charAt(0)}
          />
        </Link>
      </div>
    </aside>
  );
}

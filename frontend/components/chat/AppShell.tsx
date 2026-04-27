"use client";

import * as React from "react";
import { useParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useSocket } from "@/hooks/useSocket";
import { Sidebar } from "./Sidebar";
import { BottomTabBar } from "./BottomTabBar";
import { ChatList } from "./ChatList";

/**
 * Three-panel adaptive shell:
 *   ┌─────┬───────────────┬───────────────────────────┐
 *   │ Nav │  Chat list    │   Conversation / route    │
 *   │ 64  │  280          │   flex-1                  │
 *   └─────┴───────────────┴───────────────────────────┘
 *
 * On mobile: nav is replaced by `BottomTabBar`. The chat list and the active
 * conversation are mutually exclusive — when a chat id is in the URL, the
 * list collapses; otherwise the list takes the full width.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  // Mounting useSocket here boots the singleton once for the entire app
  // after auth has resolved (the (main) layout gates on `useMe`).
  useSocket();

  const params = useParams<{ id?: string }>();
  const pathname = usePathname() ?? "";

  // Show ChatList only on the /chat route family. Other top-level pages
  // (settings, search, etc.) skip the list entirely.
  const isChatRoute = pathname === "/chat" || pathname.startsWith("/chat/");
  const hasActiveChat = Boolean(params?.id);

  return (
    <div className="h-dvh w-full flex bg-bg text-text overflow-hidden">
      <Sidebar />

      {isChatRoute ? (
        <>
          <div
            className={cn(
              "w-full md:w-[280px] md:shrink-0",
              hasActiveChat ? "hidden md:flex" : "flex",
              "flex-col min-w-0",
            )}
          >
            <ChatList />
          </div>
          <main
            className={cn(
              "flex-1 min-w-0 flex flex-col",
              hasActiveChat ? "flex" : "hidden md:flex",
            )}
          >
            {children}
          </main>
        </>
      ) : (
        <main
          className={cn(
            "flex-1 min-w-0 flex flex-col",
            // Non-chat routes (settings/search/etc.) should scroll normally.
            "overflow-y-auto overflow-x-hidden",
            // Keep content above the mobile bottom tab bar.
            "pb-16 md:pb-0",
          )}
        >
          {children}
        </main>
      )}

      <BottomTabBar />
    </div>
  );
}

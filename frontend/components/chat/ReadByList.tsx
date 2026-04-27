"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type {
  ConversationMember,
  ReadReceiptEntry,
} from "@/types/chat";
import { Avatar } from "./Avatar";
import { formatTimeOfDay } from "@/lib/format";

interface ReadByListProps {
  readBy: ReadReceiptEntry[];
  members: ConversationMember[];
  selfUserId: string | null;
  onClose: () => void;
}

/**
 * Bottom-sheet (mobile) / centered modal (desktop) listing the participants
 * who've seen a given message. Order: most-recent receipt first.
 */
export function ReadByList({
  readBy,
  members,
  selfUserId,
  onClose,
}: ReadByListProps) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sorted = React.useMemo(() => {
    return [...readBy]
      .filter((r) => r.userId !== selfUserId)
      .sort(
        (a, b) =>
          new Date(b.seenAt).getTime() - new Date(a.seenAt).getTime(),
      );
  }, [readBy, selfUserId]);

  const memberLookup = React.useMemo(() => {
    const m = new Map<string, ConversationMember>();
    for (const member of members) m.set(member.userId, member);
    return m;
  }, [members]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Read by"
      className={cn(
        "fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4",
        "bg-black/40 animate-chat-fade-in",
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "w-full md:max-w-md bg-bg-elevated text-text",
          "rounded-t-2xl md:rounded-2xl shadow-xl",
          "animate-chat-slide-up pb-safe",
        )}
      >
        <div className="md:hidden flex justify-center py-2" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Read by</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={cn(
              "h-9 w-9 grid place-items-center rounded-full",
              "text-text-muted hover:bg-bg-subtle",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            )}
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <ul className="max-h-[60vh] overflow-y-auto py-1">
          {sorted.length === 0 ? (
            <li className="px-4 py-6 text-sm text-text-muted text-center">
              No one has read this yet.
            </li>
          ) : (
            sorted.map((r) => {
              const m = memberLookup.get(r.userId);
              const display =
                m?.user.displayName ?? m?.user.username ?? "Unknown";
              return (
                <li
                  key={r.userId}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <Avatar
                    src={m?.user.avatarUrl}
                    alt={display}
                    size={32}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-text truncate">
                      {display}
                    </span>
                  </span>
                  <span className="text-xs text-text-muted shrink-0">
                    {formatTimeOfDay(r.seenAt)}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}

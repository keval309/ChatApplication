"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import type { ConversationMember } from "@/types/chat";
import { Avatar } from "./Avatar";

export interface TypingIndicatorProps {
  userIds: string[];
  selfUserId: string | null;
  members?: ConversationMember[];
  className?: string;
}

/**
 * Animated indicator shown above the composer while remote participants are
 * typing. Avatars + staggered 3-dot bouncer + plural-aware copy.
 *
 * Animation classes (`animate-typing-dot`, `animate-chat-fade-in`) live in
 * `globals.css` behind a `prefers-reduced-motion: no-preference` guard.
 */
export function TypingIndicator({
  userIds,
  selfUserId,
  members = [],
  className,
}: TypingIndicatorProps) {
  const others = React.useMemo(
    () => userIds.filter((u) => u !== selfUserId),
    [userIds, selfUserId],
  );

  const lookup = React.useMemo(() => {
    const m = new Map<string, ConversationMember>();
    for (const member of members) m.set(member.userId, member);
    return m;
  }, [members]);

  // Reserve the slot's height so the message list doesn't jump as the
  // indicator appears/disappears. We render a transparent placeholder when
  // empty.
  if (others.length === 0) {
    return <div className={cn("h-7 shrink-0", className)} aria-hidden />;
  }

  const display = others.map(
    (id) => lookup.get(id)?.user.displayName ??
      lookup.get(id)?.user.username ??
      "Someone",
  );

  let label: string;
  if (display.length === 1) {
    label = `${display[0]} is typing…`;
  } else if (display.length === 2) {
    label = `${display[0]} and ${display[1]} are typing…`;
  } else if (display.length === 3) {
    label = `${display[0]}, ${display[1]} and ${display[2]} are typing…`;
  } else {
    label = "Several people are typing…";
  }

  return (
    <div
      className={cn(
        "h-7 shrink-0 flex items-center gap-2 px-4 animate-chat-fade-in",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={label}
    >
      <div className="flex -space-x-2">
        {others.slice(0, 3).map((id) => {
          const m = lookup.get(id);
          const name = m?.user.displayName ?? m?.user.username ?? "Someone";
          return (
            <Avatar
              key={id}
              src={m?.user.avatarUrl}
              alt={name}
              size={24}
              className="ring-2 ring-bg"
            />
          );
        })}
      </div>

      <div
        className={cn(
          "flex items-center gap-1 px-3 h-6 rounded-full",
          "bg-bg-subtle text-text-muted",
        )}
        aria-hidden
      >
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </div>

      <span className="text-xs text-text-muted truncate">{label}</span>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className={cn(
        "block h-1.5 w-1.5 rounded-full bg-text-muted",
        "animate-typing-dot",
      )}
      style={{ animationDelay: delay }}
    />
  );
}

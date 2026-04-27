"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import type { MessageReaction } from "@/types/chat";

interface AggregatedReaction {
  emoji: string;
  count: number;
  userIds: string[];
  byMe: boolean;
}

export function aggregateReactions(
  reactions: MessageReaction[],
  selfUserId: string | null,
): AggregatedReaction[] {
  const map = new Map<string, AggregatedReaction>();
  for (const r of reactions) {
    const ex = map.get(r.emoji);
    if (ex) {
      if (!ex.userIds.includes(r.userId)) {
        ex.userIds.push(r.userId);
        ex.count = ex.userIds.length;
        if (r.userId === selfUserId) ex.byMe = true;
      }
    } else {
      map.set(r.emoji, {
        emoji: r.emoji,
        count: 1,
        userIds: [r.userId],
        byMe: r.userId === selfUserId,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

interface ReactionsProps {
  reactions: MessageReaction[];
  selfUserId: string | null;
  onToggle: (emoji: string) => void;
  onShowList?: (reactions: MessageReaction[]) => void;
  isOwn: boolean;
}

export function Reactions({
  reactions,
  selfUserId,
  onToggle,
  onShowList,
  isOwn,
}: ReactionsProps) {
  const aggregated = React.useMemo(
    () => aggregateReactions(reactions, selfUserId),
    [reactions, selfUserId],
  );
  if (aggregated.length === 0) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap gap-1 mt-1",
        isOwn ? "justify-end" : "justify-start",
      )}
    >
      {aggregated.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onToggle(r.emoji)}
          onContextMenu={(e) => {
            if (onShowList) {
              e.preventDefault();
              onShowList(reactions);
            }
          }}
          aria-label={`${r.emoji} ${r.count} ${r.count === 1 ? "reaction" : "reactions"}${
            r.byMe ? ", reacted by you" : ""
          }. Tap to ${r.byMe ? "remove" : "add"} your reaction.`}
          aria-pressed={r.byMe}
          className={cn(
            "inline-flex items-center gap-1 px-2 h-7 rounded-full",
            "bg-bg-elevated border text-xs font-medium text-text",
            "transition-colors animate-reaction-pop",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            r.byMe
              ? "border-primary text-primary bg-bg-subtle"
              : "border-border hover:bg-bg-subtle",
          )}
        >
          <span aria-hidden className="text-base leading-none">
            {r.emoji}
          </span>
          <span className="tabular-nums">{r.count}</span>
        </button>
      ))}
    </div>
  );
}

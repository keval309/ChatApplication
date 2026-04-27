"use client";

import * as React from "react";
import Link from "next/link";
import { useGesture } from "@use-gesture/react";
import { BellOff, Archive } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ConversationListItem as Conversation } from "@/types/chat";
import { Avatar } from "./Avatar";
import { PresenceDot } from "./PresenceDot";
import { UnreadBadge } from "./UnreadBadge";
import { usePresence } from "@/hooks/usePresence";
import { useArchiveConversation } from "@/hooks/useConversations";
import { usePresenceStore } from "@/stores/presence-store";

interface ChatListItemProps {
  conversation: Conversation;
  isActive: boolean;
  selfUserId: string | null;
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  if (d >= startOfToday) {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const yesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  if (d >= yesterday) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function previewText(c: Conversation, selfUserId: string | null): string {
  const lm = c.lastMessage;
  if (!lm) return "Start the conversation";
  if (lm.deletedAt) return "Message deleted";
  const prefix = lm.senderId === selfUserId ? "You: " : "";
  switch (lm.type) {
    case "IMAGE":
      return `${prefix}📷 Photo`;
    case "FILE":
      return `${prefix}📎 File`;
    case "GIF":
      return `${prefix}🎞️ GIF`;
    default:
      return `${prefix}${lm.content}`;
  }
}

export function ChatListItem({
  conversation,
  isActive,
  selfUserId,
}: ChatListItemProps) {
  const archiveMut = useArchiveConversation();
  const [swipeX, setSwipeX] = React.useState(0);
  const setPresence = usePresenceStore((s) => s.setPresence);

  const display =
    conversation.type === "DM"
      ? (conversation.otherUser?.displayName ??
        conversation.otherUser?.username ??
        "Unknown")
      : (conversation.groupName ?? "Group chat");

  const avatarSrc =
    conversation.type === "DM"
      ? conversation.otherUser?.avatarUrl
      : conversation.groupAvatarUrl;

  const presence = usePresence(
    conversation.type === "DM" ? conversation.otherUser?.id : null,
  );

  React.useEffect(() => {
    if (conversation.type !== "DM") return;
    const other = conversation.otherUser;
    if (!other?.id || !other.presenceStatus) return;

    setPresence(other.id, {
      status: other.presenceStatus,
      lastSeen:
        other.lastSeenVisible === false ? null : (other.lastSeenAt ?? null),
    });
  }, [
    conversation.type,
    conversation.otherUser?.id,
    conversation.otherUser?.presenceStatus,
    conversation.otherUser?.lastSeenAt,
    conversation.otherUser?.lastSeenVisible,
    setPresence,
  ]);

  const muted = !!conversation.muteUntil;

  const bind = useGesture(
    {
      onDrag: ({ down, movement: [mx], cancel }) => {
        if (mx > 0) {
          cancel?.();
          return;
        }
        setSwipeX(down ? Math.max(mx, -120) : 0);
      },
      onDragEnd: ({ movement: [mx] }) => {
        if (mx < -80) {
          archiveMut.mutate({
            id: conversation.id,
            archived: !conversation.isArchived,
          });
        }
        setSwipeX(0);
      },
    },
    { drag: { axis: "x", pointer: { touch: true }, filterTaps: true } },
  );

  const reveal = -swipeX;

  return (
    <li className="relative overflow-hidden">
      <div
        className="absolute inset-y-0 right-0 flex items-center pr-3 gap-1 bg-bg-subtle"
        aria-hidden
        style={{ width: Math.max(reveal, 0) }}
      >
        <span className="text-xs font-medium text-text-muted flex items-center gap-1">
          <Archive className="h-4 w-4" />
          {conversation.isArchived ? "Unarchive" : "Archive"}
        </span>
      </div>

      <Link
        href={`/chat/${conversation.id}`}
        prefetch={false}
        {...bind()}
        className={cn(
          "relative flex items-center gap-3 px-3 py-3 min-h-14",
          "transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          "hover:bg-bg-subtle",
          isActive && "bg-bg-subtle",
        )}
        style={{
          transform: `translateX(${swipeX}px)`,
          touchAction: "pan-y",
        }}
        aria-current={isActive ? "page" : undefined}
      >
        {isActive ? (
          <span
            aria-hidden
            className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-primary"
          />
        ) : null}

        <div className="relative shrink-0">
          <Avatar src={avatarSrc} alt={display} size={48} />
          {conversation.type === "DM" ? (
            <span className="absolute bottom-0 right-0">
              <PresenceDot status={presence.status} />
            </span>
          ) : null}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p
              className={cn(
                "truncate text-sm",
                conversation.unreadCount > 0
                  ? "text-text font-semibold"
                  : "text-text font-medium",
              )}
            >
              {display}
            </p>
            <span className="ml-auto shrink-0 text-xs text-text-muted tabular-nums">
              {conversation.lastMessage
                ? formatRelativeTime(conversation.lastMessage.createdAt)
                : ""}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p
              className={cn(
                "truncate text-xs",
                conversation.unreadCount > 0
                  ? "text-text"
                  : "text-text-muted",
              )}
            >
              {previewText(conversation, selfUserId)}
            </p>
            <span className="ml-auto inline-flex items-center gap-1 shrink-0">
              {muted ? (
                <BellOff
                  className="h-3.5 w-3.5 text-text-muted"
                  aria-label="Muted"
                />
              ) : null}
              {conversation.unreadCount > 0 ? (
                <UnreadBadge count={conversation.unreadCount} />
              ) : null}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}


"use client";

import * as React from "react";
import {
  Check,
  CheckCheck,
  AlertTriangle,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Message, ConversationMember } from "@/types/chat";
import { useMe } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import { SOCKET_EVENTS } from "@/types/socket";
import { Avatar } from "./Avatar";
import { BubbleContent } from "./BubbleContent";
import { BubbleActions } from "./BubbleActions";
import { Reactions } from "./Reactions";
import { ReadByList } from "./ReadByList";
import { EditMessageDialog } from "./EditMessageDialog";
import { useChatStore } from "@/stores/chat-store";
import { toast } from "@/components/ui/Toaster";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatTimeOfDay, formatFullDateTime } from "@/lib/format";

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const LONG_PRESS_MS = 500;

export interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  showName: boolean;
  isGroupTail: boolean;
  members?: ConversationMember[];
}

function dispatchRetry(m: Message): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("chat:retry-failed", { detail: m }));
}

/**
 * Message bubble shell — handles alignment, tail radius, sender meta, ticks,
 * and delegates content/actions/reactions to specialised sub-components.
 */
export function MessageBubble({
  message,
  isOwn,
  showAvatar,
  showName,
  isGroupTail,
  members = [],
}: MessageBubbleProps) {
  const { data: me } = useMe();
  const { socket } = useSocket();
  const setReplyTarget = useChatStore((s) => s.setReplyTarget);
  const [actionsVisible, setActionsVisible] = React.useState(false);
  const [readBySheetOpen, setReadBySheetOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const sender = message.sender;
  const display = sender.displayName ?? sender.username ?? "Unknown";
  const failed = message.status === "failed";
  const sending = message.status === "sending";

  const isWithinEditWindow =
    !!message.createdAt &&
    Date.now() - new Date(message.createdAt).getTime() < EDIT_WINDOW_MS;

  // ── Reaction toggle (socket round-trip) ──────────────────────────────────
  const onReact = React.useCallback(
    (emoji: string) => {
      if (!socket) return;
      socket.emit(SOCKET_EVENTS.REACTION_TOGGLE, {
        messageId: message.id,
        emoji,
      });
    },
    [socket, message.id],
  );

  // ── Reply / Edit / Delete ────────────────────────────────────────────────
  const onReply = React.useCallback(
    (m: Message) => {
      setReplyTarget(m.conversationId, {
        messageId: m.id,
        senderName: m.sender.displayName ?? m.sender.username ?? "Unknown",
        preview: m.content.slice(0, 140),
      });
      setActionsVisible(false);
    },
    [setReplyTarget],
  );

  const onDelete = React.useCallback(() => {
    setConfirmOpen(true);
    setActionsVisible(false);
  }, []);

  const performDelete = React.useCallback(() => {
    if (!socket) return;
    setDeleting(true);
    socket.emit(
      SOCKET_EVENTS.MESSAGE_DELETE,
      { messageId: message.id },
      (res) => {
        setDeleting(false);
        setConfirmOpen(false);
        if (!res?.ok) {
          toast.error(res?.error?.message ?? "Failed to delete message");
        }
      },
    );
  }, [socket, message.id]);

  const onEdit = React.useCallback(() => {
    setEditOpen(true);
    setActionsVisible(false);
  }, []);

  const performEdit = React.useCallback(
    (newContent: string) => {
      if (!socket) return;
      setEditing(true);
      socket.emit(
        SOCKET_EVENTS.MESSAGE_EDIT,
        { messageId: message.id, newContent },
        (res) => {
          setEditing(false);
          if (!res?.ok) {
            toast.error(res?.error?.message ?? "Couldn't edit message");
            return;
          }
          setEditOpen(false);
        },
      );
    },
    [socket, message.id],
  );

  // ── Long-press handlers (mobile) ──────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    longPressTimer.current = setTimeout(() => {
      setActionsVisible(true);
    }, LONG_PRESS_MS);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // ── Delivery / read state for own messages ───────────────────────────────
  const otherMembers = members.filter((m) => m.userId !== me?.id);
  const readCount = message.readBy.filter((r) => r.userId !== me?.id).length;
  const readByOthers = message.readBy.some(
    (r) => r.userId !== (me?.id ?? "") && r.userId !== message.senderId,
  );
  const allReadResolved =
    message.allRead !== undefined
      ? message.allRead
      : otherMembers.length > 0 && readCount >= otherMembers.length;
  const anyReadResolved = readByOthers || message.allRead === true;

  return (
    <div
      id={`msg-${message.id}`}
      data-message-id={message.id}
      className={cn("flex items-end gap-2 px-3 group scroll-mt-4", isOwn ? "flex-row-reverse" : "flex-row")}
      onMouseEnter={() => setActionsVisible(true)}
      onMouseLeave={() => setActionsVisible(false)}
      onPointerDown={onPointerDown}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
    >
      <div className="w-8 shrink-0">
        {!isOwn && showAvatar && isGroupTail ? (
          <Avatar src={sender.avatarUrl} alt={display} size={32} />
        ) : null}
      </div>

      <div
        className={cn(
          "relative max-w-[78%] md:max-w-[68%] flex flex-col",
          isOwn ? "items-end" : "items-start",
        )}
      >
        {showName && !isOwn ? (
          <p className="text-xs font-medium text-text-muted mb-0.5 px-1">
            {display}
          </p>
        ) : null}

        <BubbleActions
          message={message}
          isOwn={isOwn}
          visible={actionsVisible && !sending && !failed && !message.deletedAt}
          onReact={onReact}
          onReply={onReply}
          onEdit={() => onEdit()}
          onDelete={() => onDelete()}
          canEdit={isWithinEditWindow}
        />

        <div
          role="article"
          aria-label={
            message.deletedAt
              ? "Deleted message"
              : `${isOwn ? "You" : display} at ${formatFullDateTime(message.createdAt)}`
          }
          className={cn(
            "px-3 py-2 text-sm shadow-sm relative",
            "rounded-[18px]",
            isOwn
              ? "bg-primary text-text-inverse"
              : "bg-bg-subtle text-text",
            isOwn && isGroupTail && "rounded-br-[4px]",
            !isOwn && isGroupTail && "rounded-bl-[4px]",
            failed && "ring-1 ring-[color:var(--color-error)]",
            sending && "opacity-80",
          )}
        >
          <BubbleContent message={message} isOwn={isOwn} />

          <div
            className={cn(
              "mt-1 flex items-center gap-1 text-[10px] select-none",
              isOwn
                ? "justify-end text-text-inverse/80"
                : "justify-start text-text-muted",
            )}
          >
            {message.editedAt && !message.deletedAt ? (
              <span className="italic">edited</span>
            ) : null}
            <span>{formatTimeOfDay(message.createdAt)}</span>
            {isOwn && !message.deletedAt ? (
              <DeliveryTicks
                sending={sending}
                failed={failed}
                deliveredAt={message.deliveredAt}
                anyRead={anyReadResolved}
                allRead={allReadResolved}
                readCount={readCount}
                onShowReadBy={
                  message.readBy.length > 0
                    ? () => setReadBySheetOpen(true)
                    : undefined
                }
              />
            ) : null}
          </div>
        </div>

        {message.replyCount > 0 ? (
          <button
            type="button"
            className={cn(
              "mt-1 inline-flex items-center gap-1 px-2 h-6 rounded-full",
              "bg-bg-elevated border border-border text-xs text-text",
              "hover:bg-bg-subtle transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            )}
            aria-label={`View ${message.replyCount} ${
              message.replyCount === 1 ? "reply" : "replies"
            }`}
          >
            <MessageSquare className="h-3 w-3 text-text-muted" aria-hidden />
            <span>
              {message.replyCount}{" "}
              {message.replyCount === 1 ? "reply" : "replies"}
            </span>
          </button>
        ) : null}

        <Reactions
          reactions={message.reactions}
          selfUserId={me?.id ?? null}
          onToggle={onReact}
          isOwn={isOwn}
        />

        {failed ? (
          <div
            className={cn(
              "mt-1 inline-flex items-center gap-1 text-[11px]",
              "text-[color:var(--color-error)]",
            )}
            role="alert"
          >
            <AlertTriangle className="h-3 w-3" aria-hidden />
            <span>Failed to send.</span>
            <button
              type="button"
              onClick={() => dispatchRetry(message)}
              className="underline font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Retry
            </button>
          </div>
        ) : null}
      </div>

      {readBySheetOpen ? (
        <ReadByList
          readBy={message.readBy}
          members={members}
          selfUserId={me?.id ?? null}
          onClose={() => setReadBySheetOpen(false)}
        />
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title="Delete message?"
        description="This will remove the message for everyone in the conversation. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={performDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      <EditMessageDialog
        open={editOpen}
        initialContent={message.content}
        loading={editing}
        onSubmit={performEdit}
        onCancel={() => setEditOpen(false)}
      />
    </div>
  );
}

// ── Delivery ticks ────────────────────────────────────────────────────────────
function DeliveryTicks({
  sending,
  failed,
  deliveredAt,
  anyRead,
  allRead,
  readCount,
  onShowReadBy,
}: {
  sending: boolean;
  failed: boolean;
  deliveredAt: string | null;
  anyRead: boolean;
  allRead: boolean;
  readCount: number;
  onShowReadBy?: () => void;
}) {
  if (failed) {
    return (
      <span aria-label="Failed to send">
        <AlertTriangle className="h-3 w-3 text-[color:var(--color-error)]" />
      </span>
    );
  }
  if (sending) {
    return (
      <span aria-label="Sending">
        <Loader2 className="h-3 w-3 animate-spin opacity-80" />
      </span>
    );
  }
  if (!deliveredAt) {
    return (
      <span aria-label="Sent" className="text-slate-300">
        <Check className="h-3 w-3" />
      </span>
    );
  }
  if (!anyRead) {
    return (
      <span aria-label="Delivered" className="text-slate-300">
        <CheckCheck className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (!allRead) {
    return (
      <span aria-label="Delivered and partially read" className="text-slate-300">
        <CheckCheck className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onShowReadBy}
      aria-label={
        allRead
          ? "Read by everyone"
          : `Read by ${readCount} ${readCount === 1 ? "person" : "people"}`
      }
      className={cn(
        "inline-flex items-center",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm",
        "text-sky-300",
      )}
    >
      <CheckCheck className="h-3.5 w-3.5" />
    </button>
  );
}

// Small re-export so consumers can import DeliveryTicks if needed.
export { DeliveryTicks };

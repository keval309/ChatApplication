"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import TextareaAutosize from "react-textarea-autosize";
import { nanoid } from "nanoid";
import { useQueryClient } from "@tanstack/react-query";
import {
  Smile,
  Paperclip,
  Send,
  Image as ImageIcon,
  X,
  CornerUpLeft,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useMe } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import { useTyping } from "@/hooks/useTyping";
import { useChatStore } from "@/stores/chat-store";
import {
  pushOptimisticMessage,
  removeOptimisticMessage,
  markOptimisticFailed,
} from "@/hooks/useMessages";
import { SOCKET_EVENTS } from "@/types/socket";
import type { MessageSendPayload } from "@/types/socket";
import type { Message } from "@/types/chat";
import { toast } from "@/components/ui/Toaster";

const SEND_TIMEOUT_MS = 5_000;
const MAX_LENGTH = 4_000;

const EmojiMart = dynamic(() => import("@emoji-mart/react"), {
  ssr: false,
  loading: () => (
    <div className="h-72 w-72 grid place-items-center bg-bg-subtle rounded-lg">
      <Loader2 className="h-5 w-5 animate-spin text-text-muted" aria-hidden />
    </div>
  ),
});

interface MessageComposerProps {
  conversationId: string;
  disabled?: boolean;
  /** Shown when connected; overrides the default "Type a message…". */
  composerPlaceholder?: string;
}

export function MessageComposer({
  conversationId,
  disabled,
  composerPlaceholder,
}: MessageComposerProps) {
  const { data: me } = useMe();
  const { socket, isConnected } = useSocket();
  const qc = useQueryClient();

  const draft = useChatStore((s) => s.drafts[conversationId] ?? "");
  const setDraft = useChatStore((s) => s.setDraft);
  const clearDraft = useChatStore((s) => s.clearDraft);
  const replyTarget = useChatStore((s) => s.replyTargets[conversationId] ?? null);
  const setReplyTarget = useChatStore((s) => s.setReplyTarget);

  const { notifyTyping, notifyStopped } = useTyping(conversationId);

  const [emojiOpen, setEmojiOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const trimmed = draft.trim();
  const overLimit = draft.length > MAX_LENGTH;
  const canSend = trimmed.length > 0 && !overLimit && !submitting && !disabled;

  // Focus textarea when reply target appears.
  React.useEffect(() => {
    if (replyTarget) textareaRef.current?.focus();
  }, [replyTarget]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(conversationId, e.target.value);
    if (e.target.value.length > 0) notifyTyping();
    else notifyStopped();
  };

  const handleBlur = () => {
    notifyStopped();
  };

  const insertAtCursor = (text: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setDraft(conversationId, draft + text);
      return;
    }
    const start = ta.selectionStart ?? draft.length;
    const end = ta.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + text + draft.slice(end);
    setDraft(conversationId, next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + text.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const sendNow = React.useCallback(async () => {
    if (!socket || !me || !canSend) return;
    const content = trimmed;
    const tempId = nanoid();
    const idempotencyKey = nanoid();
    const parentId = replyTarget?.messageId ?? null;

    const optimistic: Message = {
      id: tempId,
      conversationId,
      senderId: me.id,
      content,
      type: "TEXT",
      parentId,
      editedAt: null,
      deliveredAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sender: {
        id: me.id,
        username: me.username,
        displayName: me.displayName,
        avatarUrl: me.avatarUrl,
      },
      reactions: [],
      replyCount: 0,
      readBy: [],
      status: "sending",
      tempId,
      idempotencyKey,
    };
    pushOptimisticMessage(qc, conversationId, optimistic);

    setSubmitting(true);
    clearDraft(conversationId);
    setReplyTarget(conversationId, null);
    notifyStopped();

    const payload: MessageSendPayload = {
      conversationId,
      content,
      type: "TEXT",
      parentId,
      idempotencyKey,
    };

    try {
      const ack = await socket
        .timeout(SEND_TIMEOUT_MS)
        .emitWithAck(SOCKET_EVENTS.MESSAGE_SEND, payload);
      if (!ack?.ok) {
        markOptimisticFailed(qc, conversationId, tempId);
        toast.error(ack?.error?.message ?? "Couldn't send message");
        // Restore the draft so the user can edit/retry without retyping.
        setDraft(conversationId, content);
        return;
      }
      // Server-side broadcast (`message:new`) reconciles via idempotencyKey
      // → useMessages replaces the optimistic temp with the real message.
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Network unavailable";
      // If the temp is still there, mark it as failed; otherwise drop it.
      markOptimisticFailed(qc, conversationId, tempId);
      toast.error(`Couldn't send message: ${msg}`);
      setDraft(conversationId, content);
    } finally {
      setSubmitting(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [
    socket,
    me,
    canSend,
    trimmed,
    replyTarget,
    qc,
    conversationId,
    clearDraft,
    setReplyTarget,
    notifyStopped,
    setDraft,
  ]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendNow();
      return;
    }
    if (e.key === "Escape") {
      if (replyTarget) {
        e.preventDefault();
        setReplyTarget(conversationId, null);
      } else if (emojiOpen) {
        e.preventDefault();
        setEmojiOpen(false);
      }
    }
  };

  // Retries are handled by clicking the failed bubble's retry — the bubble
  // exposes `onRetry` to its consumers, who call into the helpers below to
  // remove the failed temp and prime the composer with the original content.
  // (Surfaced via the `useRetryFailedSend` hook export.)
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Message>).detail;
      if (!detail || !detail.tempId) return;
      if (detail.conversationId !== conversationId) return;
      removeOptimisticMessage(qc, conversationId, detail.tempId);
      setDraft(conversationId, detail.content);
      requestAnimationFrame(() => textareaRef.current?.focus());
    };
    window.addEventListener("chat:retry-failed", handler);
    return () => window.removeEventListener("chat:retry-failed", handler);
  }, [conversationId, qc, setDraft]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void sendNow();
      }}
      className={cn(
        "relative shrink-0 bg-bg-elevated border-t border-border pb-safe",
      )}
    >
      {replyTarget ? (
        <ReplyBar
          senderName={replyTarget.senderName}
          preview={replyTarget.preview}
          onDismiss={() => setReplyTarget(conversationId, null)}
        />
      ) : null}

      <div className="flex items-end gap-1.5 p-2">
        <ToolbarButton
          ariaLabel="Add attachment"
          icon={<Paperclip className="h-5 w-5" />}
        />
        <ToolbarButton
          ariaLabel="Add image"
          icon={<ImageIcon className="h-5 w-5" />}
        />

        <div className="flex-1 relative min-w-0">
          <TextareaAutosize
            ref={textareaRef}
            value={draft}
            disabled={disabled}
            onChange={handleChange}
            onKeyDown={onKeyDown}
            onBlur={handleBlur}
            placeholder={
              !isConnected
                ? "Reconnecting…"
                : (composerPlaceholder ?? "Type a message…")
            }
            minRows={1}
            maxRows={5}
            aria-label="Message"
            className={cn(
              "w-full resize-none rounded-2xl bg-bg-subtle border border-border",
              "px-3 py-2 text-sm text-text placeholder:text-text-muted",
              "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              overLimit && "border-[color:var(--color-error)] focus-visible:border-[color:var(--color-error)] focus-visible:ring-[color:var(--color-error)]",
            )}
          />
          {overLimit ? (
            <span
              className="absolute -top-5 right-1 text-[11px] text-[color:var(--color-error)]"
              role="alert"
            >
              {draft.length} / {MAX_LENGTH}
            </span>
          ) : null}
        </div>

        <ToolbarButton
          ariaLabel="Pick emoji"
          icon={<Smile className="h-5 w-5" />}
          onClick={() => setEmojiOpen((p) => !p)}
          pressed={emojiOpen}
        />

        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          className={cn(
            "h-11 w-11 md:h-9 md:w-9 grid place-items-center rounded-full shrink-0",
            "bg-primary text-text-inverse hover:bg-primary-hover",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            "transition-colors",
          )}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>

      {emojiOpen ? (
        <div className="absolute bottom-20 right-4 z-30 shadow-xl rounded-lg overflow-hidden">
          <EmojiMart
            theme="auto"
            previewPosition="none"
            skinTonePosition="none"
            onEmojiSelect={(emoji: { native?: string }) => {
              if (emoji.native) insertAtCursor(emoji.native);
              setEmojiOpen(false);
            }}
            data={async () => (await import("@emoji-mart/data")).default}
          />
        </div>
      ) : null}
    </form>
  );
}

function ToolbarButton({
  ariaLabel,
  icon,
  onClick,
  pressed,
}: {
  ariaLabel: string;
  icon: React.ReactNode;
  onClick?: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      className={cn(
        "h-11 w-11 md:h-9 md:w-9 grid place-items-center rounded-full shrink-0",
        "text-text-muted hover:bg-bg-subtle hover:text-text",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        pressed && "bg-bg-subtle text-text",
      )}
    >
      {icon}
    </button>
  );
}

function ReplyBar({
  senderName,
  preview,
  onDismiss,
}: {
  senderName: string;
  preview: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-3 py-2 mx-2 mt-2 rounded-md",
        "bg-bg-subtle border-l-2 border-primary",
        "animate-chat-slide-up",
      )}
    >
      <CornerUpLeft className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-primary">
          Replying to {senderName}
        </p>
        <p className="text-xs text-text-muted truncate">{preview}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss reply"
        className={cn(
          "h-7 w-7 grid place-items-center rounded-full shrink-0",
          "text-text-muted hover:bg-bg-elevated",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        )}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

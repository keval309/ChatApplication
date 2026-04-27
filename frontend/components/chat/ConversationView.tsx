"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowLeft,
  ChevronDown,
  Phone,
  Video,
  MoreVertical,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import * as chatApi from "@/lib/chat-api";
import type { ConversationListItem, ConversationsPage, Message } from "@/types/chat";
import { useMe } from "@/hooks/useAuth";
import {
  useMarkConversationRead,
  useArchiveConversation,
  useClearConversationHistory,
  useDeleteConversation,
  useMuteConversation,
  useUnmuteConversation,
  conversationsQueryKey,
} from "@/hooks/useConversations";
import { useBlockUser, useUnblockUser } from "@/hooks/useAuth";
import { useMessages, messagesQueryKey } from "@/hooks/useMessages";
import { useTyping } from "@/hooks/useTyping";
import { usePresence, formatLastSeen } from "@/hooks/usePresence";
import { useSocket } from "@/hooks/useSocket";
import { SOCKET_EVENTS } from "@/types/socket";
import type {
  ConversationDeletedEvent,
  ConversationRemovedForMeEvent,
  ReceiptReadPayload,
} from "@/types/socket";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/ui/Toaster";
import type { MuteDuration } from "@/lib/chat-api";
import { Avatar } from "./Avatar";
import { PresenceDot } from "./PresenceDot";
import { MessageBubble } from "./MessageBubble";
import { MessageComposer } from "./MessageComposer";
import { TypingIndicator } from "./TypingIndicator";
import { Button } from "@/components/ui/Button";
import { seedDmPeerPresenceFromApi } from "@/stores/presence-store";

// ── Item types for the virtual list ──────────────────────────────────────────
type RenderItem =
  | { kind: "loader"; id: "__loader__" }
  | { kind: "separator"; id: string; label: string }
  | {
      kind: "message";
      id: string;
      message: Message;
      showAvatar: boolean;
      showName: boolean;
      isOwn: boolean;
      isGroupTail: boolean;
    };

const SAME_GROUP_WINDOW_MS = 2 * 60 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dateLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = today - 24 * 60 * 60 * 1000;
  const dayOfMsg = startOfDay(d);
  if (dayOfMsg === today) return "Today";
  if (dayOfMsg === yesterday) return "Yesterday";
  // Older this year → "Apr 20"; previous years → "Apr 20, 2024"
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildRenderItems(
  messages: Message[],
  selfUserId: string | null,
  showLoader: boolean,
): RenderItem[] {
  const items: RenderItem[] = [];
  if (showLoader) items.push({ kind: "loader", id: "__loader__" });

  let prevDay = -1;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const next = messages[i + 1];
    const prev = messages[i - 1];
    const day = startOfDay(new Date(m.createdAt));
    if (day !== prevDay) {
      items.push({
        kind: "separator",
        id: `sep-${day}-${m.id}`,
        label: dateLabel(m.createdAt),
      });
      prevDay = day;
    }

    const isOwn = m.senderId === selfUserId;

    // Group with previous: same sender, same day, within 2 min, both not deleted-edge
    const groupedWithPrev =
      !!prev &&
      prev.senderId === m.senderId &&
      startOfDay(new Date(prev.createdAt)) === day &&
      new Date(m.createdAt).getTime() -
        new Date(prev.createdAt).getTime() <
        SAME_GROUP_WINDOW_MS;

    // Group with next: same sender + within 2 min
    const groupedWithNext =
      !!next &&
      next.senderId === m.senderId &&
      startOfDay(new Date(next.createdAt)) === day &&
      new Date(next.createdAt).getTime() -
        new Date(m.createdAt).getTime() <
        SAME_GROUP_WINDOW_MS;

    items.push({
      kind: "message",
      id: m.id || m.tempId || `tmp-${i}`,
      message: m,
      // Avatar shown on the LAST message of a group (tail).
      showAvatar: !groupedWithNext,
      // Sender name shown on the FIRST of a group (head).
      showName: !groupedWithPrev,
      isOwn,
      isGroupTail: !groupedWithNext,
    });
  }
  return items;
}

// ── ConversationView ─────────────────────────────────────────────────────────
interface ConversationViewProps {
  conversationId: string;
}

export function ConversationView({ conversationId }: ConversationViewProps) {
  const router = useRouter();
  const { data: me } = useMe();
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();

  const [moreMenuOpen, setMoreMenuOpen] = React.useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = React.useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const [confirmBlockOpen, setConfirmBlockOpen] = React.useState(false);
  const moreMenuRef = React.useRef<HTMLDivElement | null>(null);

  const clearHistory = useClearConversationHistory();
  const deleteConv = useDeleteConversation();
  const muteConv = useMuteConversation();
  const unmuteConv = useUnmuteConversation();
  const archiveConv = useArchiveConversation();
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();

  const conversationQuery = useQuery<ConversationListItem>({
    queryKey: ["conversation", conversationId],
    queryFn: () => chatApi.getConversation(conversationId),
    staleTime: 60_000,
  });

  React.useEffect(() => {
    if (!socket) return;
    const onDeleted = (e: ConversationDeletedEvent) => {
      if (e.conversationId !== conversationId) return;
      toast("This conversation was deleted.");
      router.push("/chat");
    };
    const onRemovedForMe = (e: ConversationRemovedForMeEvent) => {
      if (e.conversationId !== conversationId) return;
      toast("This chat was removed from your inbox.");
      router.push("/chat");
    };
    socket.on(SOCKET_EVENTS.CONVERSATION_DELETED, onDeleted);
    socket.on(SOCKET_EVENTS.CONVERSATION_REMOVED_FOR_ME, onRemovedForMe);
    return () => {
      socket.off(SOCKET_EVENTS.CONVERSATION_DELETED, onDeleted);
      socket.off(SOCKET_EVENTS.CONVERSATION_REMOVED_FOR_ME, onRemovedForMe);
    };
  }, [socket, conversationId, router]);

  React.useEffect(() => {
    if (!moreMenuOpen) return;
    const onDoc = (ev: MouseEvent) => {
      const el = moreMenuRef.current;
      if (el && !el.contains(ev.target as Node)) setMoreMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreMenuOpen]);

  const {
    messages,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMessages(conversationId);

  const { typingUserIds } = useTyping(conversationId);
  const markRead = useMarkConversationRead();
  const pendingReceiptIdsRef = React.useRef<Set<string>>(new Set());
  const flushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build the flat render list (date separators + grouping).
  const items = React.useMemo(
    () => buildRenderItems(messages, me?.id ?? null, hasNextPage ?? false),
    [messages, me?.id, hasNextPage],
  );

  // Virtualizer ──────────────────────────────────────────────────────────────
  const parentRef = React.useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => {
      const it = items[i];
      if (!it) return 64;
      if (it.kind === "loader") return 56;
      if (it.kind === "separator") return 36;
      return 64;
    },
    overscan: 8,
    getItemKey: (i) => items[i]?.id ?? i,
    measureElement:
      typeof window !== "undefined" &&
      "ResizeObserver" in window
        ? (el) => el.getBoundingClientRect().height
        : undefined,
  });

  // Scroll-position preservation when older pages are prepended ──────────────
  const prevTopHeightRef = React.useRef<number>(0);
  const [pendingPrependRestore, setPendingPrependRestore] = React.useState(false);

  const onLoadOlder = React.useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    const el = parentRef.current;
    if (el) prevTopHeightRef.current = el.scrollHeight - el.scrollTop;
    setPendingPrependRestore(true);
    void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  React.useLayoutEffect(() => {
    if (!pendingPrependRestore) return;
    if (isFetchingNextPage) return;
    const el = parentRef.current;
    if (!el) return;
    // Restore the offset so the user's reading position stays anchored.
    el.scrollTop = el.scrollHeight - prevTopHeightRef.current;
    setPendingPrependRestore(false);
  }, [pendingPrependRestore, isFetchingNextPage, items.length]);

  // Initial mount + new-message-at-bottom auto-scroll behaviour ──────────────
  const isAtBottomRef = React.useRef(true);
  const [showJumpButton, setShowJumpButton] = React.useState(false);
  const [missedCount, setMissedCount] = React.useState(0);

  const scrollToBottom = React.useCallback((opts?: { smooth?: boolean }) => {
    const el = parentRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: opts?.smooth ? "smooth" : "auto",
    });
    isAtBottomRef.current = true;
    setShowJumpButton(false);
    setMissedCount(0);
  }, []);

  // Track scroll position
  React.useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      const atBottom = dist < 80;
      isAtBottomRef.current = atBottom;
      setShowJumpButton(dist > 300);
      if (atBottom) setMissedCount(0);

      // Trigger older-page fetch when within ~120px of the top.
      if (el.scrollTop < 120 && hasNextPage && !isFetchingNextPage) {
        onLoadOlder();
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [hasNextPage, isFetchingNextPage, onLoadOlder]);

  // First-load: jump to bottom once messages are present.
  const initialAnchoredRef = React.useRef(false);
  React.useLayoutEffect(() => {
    if (initialAnchoredRef.current) return;
    if (isLoading) return;
    if (messages.length === 0) {
      initialAnchoredRef.current = true;
      return;
    }
    scrollToBottom();
    initialAnchoredRef.current = true;
  }, [isLoading, messages.length, scrollToBottom]);

  // When a new last message lands, auto-scroll if the user is at the bottom;
  // otherwise increment "missed" counter to display on the floating button.
  const lastSeenIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (messages.length === 0) {
      lastSeenIdRef.current = null;
      return;
    }
    const last = messages[messages.length - 1];
    if (lastSeenIdRef.current === last.id) return;
    const isFirstAnchor = lastSeenIdRef.current === null;
    lastSeenIdRef.current = last.id;
    if (isFirstAnchor) return;
    if (isAtBottomRef.current) {
      // Defer to next paint so item heights are measured.
      requestAnimationFrame(() => scrollToBottom({ smooth: true }));
    } else if (last.senderId !== me?.id) {
      setMissedCount((n) => n + 1);
    }
  }, [messages, me?.id, scrollToBottom]);

  // Reset "anchored" state and clear missed counter when the conversation id changes.
  React.useEffect(() => {
    initialAnchoredRef.current = false;
    lastSeenIdRef.current = null;
    prevTopHeightRef.current = 0;
    setMissedCount(0);
    setShowJumpButton(false);
    setPendingPrependRestore(false);
  }, [conversationId]);

  const clearUnreadCache = React.useCallback(() => {
    const filters = ["ALL", "ARCHIVED", "GROUPS"] as const;
    for (const filter of filters) {
      queryClient.setQueryData<InfiniteData<ConversationsPage>>(
        conversationsQueryKey(filter),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              conversations: page.conversations.map((c) =>
                c.id === conversationId ? { ...c, unreadCount: 0 } : c,
              ),
            })),
          };
        },
      );
    }
  }, [conversationId, queryClient]);

  const flushReadReceipts = React.useCallback(() => {
    if (!socket) return;
    const ids = Array.from(pendingReceiptIdsRef.current);
    pendingReceiptIdsRef.current.clear();
    flushTimerRef.current = null;
    if (ids.length === 0) return;

    markRead.mutate(conversationId);
    const payload: ReceiptReadPayload = { conversationId, messageIds: ids };
    socket.emit(SOCKET_EVENTS.RECEIPT_READ, payload);
    clearUnreadCache();
  }, [socket, markRead, conversationId, clearUnreadCache]);

  const enqueueReadReceipt = React.useCallback(
    (messageId: string) => {
      pendingReceiptIdsRef.current.add(messageId);
      if (flushTimerRef.current) return;
      flushTimerRef.current = setTimeout(flushReadReceipts, 500);
    },
    [flushReadReceipts],
  );

  React.useEffect(() => {
    const root = parentRef.current;
    if (!root || !me) return;
    const byId = new Map(messages.map((m) => [m.id, m]));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.9) continue;
          const element = entry.target as HTMLElement;
          const messageId = element.dataset.messageId;
          if (!messageId) continue;
          const msg = byId.get(messageId);
          if (!msg) continue;
          if (msg.senderId === me.id) continue;
          if (msg.readBy.some((r) => r.userId === me.id)) continue;
          enqueueReadReceipt(msg.id);
        }
      },
      { root, threshold: 0.9 },
    );

    const nodes = root.querySelectorAll<HTMLElement>("[data-message-id]");
    nodes.forEach((n) => observer.observe(n));

    // Initial visible-message sweep when opening/focusing conversation.
    for (const node of Array.from(nodes)) {
      const messageId = node.dataset.messageId;
      if (!messageId) continue;
      const msg = byId.get(messageId);
      if (!msg || msg.senderId === me.id) continue;
      if (msg.readBy.some((r) => r.userId === me.id)) continue;
      const rect = node.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const visibleHeight =
        Math.min(rect.bottom, rootRect.bottom) - Math.max(rect.top, rootRect.top);
      const ratio = Math.max(0, visibleHeight) / Math.max(rect.height, 1);
      if (ratio >= 0.9) enqueueReadReceipt(msg.id);
    }

    return () => {
      observer.disconnect();
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, [messages, me, enqueueReadReceipt]);

  // Header info ───────────────────────────────────────────────────────────────
  const conv = conversationQuery.data;
  const otherUser = conv?.otherUser ?? null;
  React.useEffect(() => {
    if (!otherUser?.id) return;
    seedDmPeerPresenceFromApi({
      id: otherUser.id,
      presenceStatus: otherUser.presenceStatus,
      lastSeenAt: otherUser.lastSeenAt ?? null,
      lastSeenVisible: otherUser.lastSeenVisible,
    });
  }, [
    otherUser?.id,
    otherUser?.presenceStatus,
    otherUser?.lastSeenAt,
    otherUser?.lastSeenVisible,
  ]);
  const presenceLive = usePresence(otherUser?.id);
  const dmPeerPresenceAndAvatarHidden =
    conv?.type === "DM" &&
    Boolean(conv.otherBlockedMe || conv.iBlockedOther);
  const presence = dmPeerPresenceAndAvatarHidden
    ? ({ status: "OFFLINE" as const, lastSeen: null })
    : presenceLive;
  const peerFirstName =
    otherUser?.displayName?.split(/\s+/)[0] ??
    otherUser?.username ??
    "this contact";
  const headerName =
    conv?.type === "DM"
      ? (otherUser?.displayName ?? otherUser?.username ?? "Conversation")
      : (conv?.groupName ?? "Group chat");
  const headerSubtitle =
    conv?.type === "DM"
      ? formatLastSeen(presence)
      : `${conv?.members.length ?? 0} members`;

  const runMute = (duration: MuteDuration) => {
    muteConv.mutate(
      { id: conversationId, duration, autoUnmuteReminder: false },
      {
        onSuccess: () => {
          setMoreMenuOpen(false);
          toast.success("Notifications muted for this chat.");
        },
        onError: () => toast.error("Could not mute this chat."),
      },
    );
  };

  const handleUnmute = () => {
    unmuteConv.mutate(conversationId, {
      onSuccess: () => {
        setMoreMenuOpen(false);
        toast.success("Notifications on for this chat.");
      },
      onError: () => toast.error("Could not unmute."),
    });
  };

  const deleteConfirmDescription = React.useMemo(() => {
    if (!conv) return "";
    if (conv.type === "GROUP") {
      const role = conv.members.find((m) => m.userId === me?.id)?.role;
      if (role === "OWNER") {
        return "This group will be permanently deleted for all members, including all messages. This cannot be undone.";
      }
      return "You will leave this group. Your view of the history will be cleared; other members keep the full group.";
    }
    return "Your copy of this chat will be cleared and removed from your inbox. If they message you again, you will only see new messages.";
  }, [conv, me?.id]);

  const handleClearConfirm = () => {
    clearHistory.mutate(conversationId, {
      onSuccess: () => {
        setConfirmClearOpen(false);
        setMoreMenuOpen(false);
        void conversationQuery.refetch();
        void queryClient.invalidateQueries({ queryKey: messagesQueryKey(conversationId) });
        toast.success("Chat cleared for you.");
      },
      onError: () => toast.error("Could not clear chat."),
    });
  };

  const handleDeleteConfirm = () => {
    deleteConv.mutate(conversationId, {
      onSuccess: () => {
        setConfirmDeleteOpen(false);
        setMoreMenuOpen(false);
        router.push("/chat");
        const isGroupOwner =
          conv?.type === "GROUP" &&
          conv.members.find((m) => m.userId === me?.id)?.role === "OWNER";
        toast.success(isGroupOwner ? "Group deleted." : "Removed from your chats.");
      },
      onError: () => toast.error("Could not delete conversation."),
    });
  };

  const handleBlockConfirm = () => {
    if (!otherUser?.id) return;
    blockUser.mutate(otherUser.id, {
      onSuccess: () => {
        setConfirmBlockOpen(false);
        setMoreMenuOpen(false);
        void conversationQuery.refetch();
        toast.success("User blocked.");
      },
      onError: () => toast.error("Could not block user."),
    });
  };

  const handleUnblock = () => {
    if (!otherUser?.id) return;
    unblockUser.mutate(otherUser.id, {
      onSuccess: () => {
        setMoreMenuOpen(false);
        void conversationQuery.refetch();
        toast.success("User unblocked.");
      },
      onError: () => toast.error("Could not unblock."),
    });
  };

  const handleToggleArchive = () => {
    if (!conv) return;
    const nextArchived = !conv.isArchived;
    archiveConv.mutate(
      { id: conversationId, archived: nextArchived },
      {
        onSuccess: () => {
          setMoreMenuOpen(false);
          void conversationQuery.refetch();
          toast.success(
            nextArchived
              ? "Chat archived. Find it under Archived."
              : "Chat moved back to All.",
          );
        },
        onError: () => toast.error("Could not update archive."),
      },
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0 bg-bg relative">
      <ConversationHeader
        loading={conversationQuery.isLoading}
        onBack={() => router.push("/chat")}
        avatarSrc={conv?.type === "DM" ? otherUser?.avatarUrl : conv?.groupAvatarUrl}
        name={headerName}
        subtitle={headerSubtitle}
        presenceStatus={
          conv?.type === "DM" ? presence.status : null
        }
        connected={isConnected}
        moreMenuOpen={moreMenuOpen}
        onToggleMore={() => setMoreMenuOpen((o) => !o)}
        moreMenuRef={moreMenuRef}
        conv={conv}
        onMute8h={() => runMute("8h")}
        onMute1d={() => runMute("1d")}
        onMuteForever={() => runMute("forever")}
        onUnmute={handleUnmute}
        onClearChat={() => {
          setMoreMenuOpen(false);
          setConfirmClearOpen(true);
        }}
        onDeleteChat={() => {
          setMoreMenuOpen(false);
          setConfirmDeleteOpen(true);
        }}
        onBlock={() => {
          setMoreMenuOpen(false);
          setConfirmBlockOpen(true);
        }}
        onToggleArchive={handleToggleArchive}
        archivePending={archiveConv.isPending}
        mutePending={muteConv.isPending}
        unmutePending={unmuteConv.isPending}
      />

      {conv?.isMuted ? (
        <div
          className="shrink-0 px-3 py-2 border-b border-border bg-bg-elevated flex flex-wrap items-center justify-between gap-2"
          role="status"
        >
          <p className="text-xs text-text-muted">
            You have muted notifications for this chat.
          </p>
          <Button
            size="sm"
            variant="ghost"
            loading={unmuteConv.isPending}
            onClick={handleUnmute}
          >
            Unmute
          </Button>
        </div>
      ) : null}

      {conv?.type === "DM" && conv.iBlockedOther ? (
        <div
          className="shrink-0 px-3 py-2 border-b border-border bg-bg-elevated flex flex-wrap items-center justify-between gap-2"
          role="status"
        >
          <p className="text-xs text-text-muted">
            Unblock {peerFirstName} to send a message.
          </p>
          <Button
            size="sm"
            variant="ghost"
            loading={unblockUser.isPending}
            onClick={handleUnblock}
          >
            Unblock
          </Button>
        </div>
      ) : null}

      <div
        ref={parentRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Messages"
      >
        {isLoading ? (
          <MessagesSkeleton />
        ) : isError ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertCircle className="h-8 w-8 text-text-muted" aria-hidden />
            <p className="text-sm text-text">We couldn&apos;t load this chat.</p>
            <Button size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyConversationState />
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const item = items[vi.index];
              if (!item) return null;
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vi.start}px)`,
                  }}
                  className="py-0.5"
                >
                  {item.kind === "loader" ? (
                    <LoaderRow
                      loading={isFetchingNextPage}
                      onClick={onLoadOlder}
                    />
                  ) : item.kind === "separator" ? (
                    <DateSeparator label={item.label} />
                  ) : (
                    <MessageBubble
                      message={item.message}
                      isOwn={item.isOwn}
                      showAvatar={item.showAvatar}
                      showName={item.showName}
                      isGroupTail={item.isGroupTail}
                      members={conv?.members ?? []}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TypingIndicator
        userIds={typingUserIds}
        selfUserId={me?.id ?? null}
        members={conv?.members ?? []}
      />

      {showJumpButton ? (
        <button
          type="button"
          onClick={() => scrollToBottom({ smooth: true })}
          aria-label={
            missedCount > 0
              ? `Jump to latest. ${missedCount} new ${missedCount === 1 ? "message" : "messages"}.`
              : "Jump to latest"
          }
          className={cn(
            "absolute right-4 bottom-24 md:bottom-20 z-10",
            "flex items-center gap-2 px-3 h-10 rounded-full",
            "bg-bg-elevated text-text border border-border shadow-md",
            "hover:bg-bg-subtle transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            "animate-chat-fade-in",
          )}
        >
          <ChevronDown className="h-4 w-4" />
          <span className="text-sm font-medium">
            {missedCount > 0
              ? `${missedCount} new ${missedCount === 1 ? "message" : "messages"}`
              : "Latest"}
          </span>
        </button>
      ) : null}

      <MessageComposer
        conversationId={conversationId}
        disabled={
          !isConnected ||
          Boolean(conv?.type === "DM" && conv.iBlockedOther)
        }
        composerPlaceholder={
          conv?.type === "DM" && conv.iBlockedOther && isConnected
            ? `Unblock ${peerFirstName} to send a message.`
            : undefined
        }
      />

      <ConfirmDialog
        open={confirmClearOpen}
        title="Clear chat for you?"
        description="Older messages will be hidden on your devices only. Others in this chat still see the full history."
        confirmLabel="Clear chat"
        cancelLabel="Cancel"
        destructive
        loading={clearHistory.isPending}
        onConfirm={handleClearConfirm}
        onCancel={() => setConfirmClearOpen(false)}
      />

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={
          conv?.type === "GROUP" &&
          conv.members.find((m) => m.userId === me?.id)?.role === "OWNER"
            ? "Delete this group?"
            : "Remove this chat?"
        }
        description={deleteConfirmDescription}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        loading={deleteConv.isPending}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDeleteOpen(false)}
      />

      <ConfirmDialog
        open={confirmBlockOpen}
        title="Block this user?"
        description="They will not receive your chat notifications. You can unblock them later in settings or from this chat."
        confirmLabel="Block"
        cancelLabel="Cancel"
        destructive
        loading={blockUser.isPending}
        onConfirm={handleBlockConfirm}
        onCancel={() => setConfirmBlockOpen(false)}
      />
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────────
function ConversationHeader({
  loading,
  onBack,
  avatarSrc,
  name,
  subtitle,
  presenceStatus,
  connected,
  moreMenuOpen,
  onToggleMore,
  moreMenuRef,
  conv,
  onMute8h,
  onMute1d,
  onMuteForever,
  onUnmute,
  onClearChat,
  onDeleteChat,
  onBlock,
  onToggleArchive,
  archivePending,
  mutePending,
  unmutePending,
}: {
  loading: boolean;
  onBack: () => void;
  avatarSrc: string | null | undefined;
  name: string;
  subtitle: string;
  presenceStatus: import("@/types/auth").PresenceStatus | null;
  connected: boolean;
  moreMenuOpen: boolean;
  onToggleMore: () => void;
  moreMenuRef: React.RefObject<HTMLDivElement | null>;
  conv: ConversationListItem | undefined;
  onMute8h: () => void;
  onMute1d: () => void;
  onMuteForever: () => void;
  onUnmute: () => void;
  onClearChat: () => void;
  onDeleteChat: () => void;
  onBlock: () => void;
  onToggleArchive: () => void;
  archivePending: boolean;
  mutePending: boolean;
  unmutePending: boolean;
}) {
  return (
    <header className="flex items-center gap-3 px-3 py-2 border-b border-border bg-bg-elevated min-h-14 shrink-0">
      <button
        type="button"
        aria-label="Back to chats"
        onClick={onBack}
        className={cn(
          "md:hidden h-11 w-11 grid place-items-center rounded-full",
          "text-text-muted hover:bg-bg-subtle",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        )}
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <div className="relative shrink-0">
        <Avatar src={avatarSrc} alt={name} size={40} />
        {presenceStatus ? (
          <span className="absolute bottom-0 right-0">
            <PresenceDot status={presenceStatus} size="sm" />
          </span>
        ) : null}
      </div>

      <div className="flex-1 min-w-0">
        {loading ? (
          <>
            <div className="h-3.5 w-32 bg-bg-subtle rounded animate-pulse" />
            <div className="h-3 w-20 bg-bg-subtle rounded animate-pulse mt-1.5" />
          </>
        ) : (
          <>
            <p className="truncate text-sm font-semibold text-text">{name}</p>
            <p className="truncate text-xs text-text-muted">
              {connected ? subtitle : "Reconnecting…"}
            </p>
          </>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          aria-label="Voice call"
          className={cn(
            "h-11 w-11 grid place-items-center rounded-full",
            "text-text-muted hover:bg-bg-subtle",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          )}
        >
          <Phone className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Video call"
          className={cn(
            "h-11 w-11 grid place-items-center rounded-full",
            "text-text-muted hover:bg-bg-subtle",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          )}
        >
          <Video className="h-5 w-5" />
        </button>
        <div className="relative" ref={moreMenuRef}>
          <button
            type="button"
            aria-label="Conversation actions"
            aria-expanded={moreMenuOpen}
            aria-haspopup="menu"
            onClick={onToggleMore}
            className={cn(
              "h-11 w-11 grid place-items-center rounded-full",
              "text-text-muted hover:bg-bg-subtle",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              moreMenuOpen && "bg-bg-subtle",
            )}
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {moreMenuOpen && !loading ? (
            <div
              role="menu"
              className={cn(
                "absolute right-0 top-full mt-1 z-20 min-w-[200px] py-1 rounded-xl",
                "border border-border bg-bg-elevated shadow-lg",
              )}
            >
              {conv?.isMuted ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={unmutePending}
                  onClick={onUnmute}
                  className="w-full text-left px-3 py-2 text-sm text-text hover:bg-bg-subtle"
                >
                  Unmute notifications
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={mutePending}
                    onClick={onMute8h}
                    className="w-full text-left px-3 py-2 text-sm text-text hover:bg-bg-subtle"
                  >
                    Mute 8 hours
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={mutePending}
                    onClick={onMute1d}
                    className="w-full text-left px-3 py-2 text-sm text-text hover:bg-bg-subtle"
                  >
                    Mute 1 day
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={mutePending}
                    onClick={onMuteForever}
                    className="w-full text-left px-3 py-2 text-sm text-text hover:bg-bg-subtle"
                  >
                    Mute always
                  </button>
                </>
              )}
              <hr className="my-1 border-border" />
              <button
                type="button"
                role="menuitem"
                disabled={archivePending}
                onClick={onToggleArchive}
                className="w-full text-left px-3 py-2 text-sm text-text hover:bg-bg-subtle"
              >
                {conv?.isArchived ? "Unarchive chat" : "Archive chat"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={onClearChat}
                className="w-full text-left px-3 py-2 text-sm text-text hover:bg-bg-subtle"
              >
                Clear chat
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={onDeleteChat}
                className="w-full text-left px-3 py-2 text-sm text-[color:var(--color-error)] hover:bg-bg-subtle"
              >
                Delete conversation
              </button>
              {conv?.type === "DM" && !conv.iBlockedOther ? (
                <>
                  <hr className="my-1 border-border" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={onBlock}
                    className="w-full text-left px-3 py-2 text-sm text-[color:var(--color-error)] hover:bg-bg-subtle"
                  >
                    Block user
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div
      role="separator"
      aria-label={label}
      className="flex items-center gap-3 px-4 py-2"
    >
      <span className="flex-1 h-px bg-border" aria-hidden />
      <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
        {label}
      </span>
      <span className="flex-1 h-px bg-border" aria-hidden />
    </div>
  );
}

function LoaderRow({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex justify-center py-3">
      <Button
        variant="ghost"
        size="sm"
        loading={loading}
        onClick={onClick}
      >
        Load older messages
      </Button>
    </div>
  );
}

function EmptyConversationState() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-medium text-text">No messages yet</p>
      <p className="text-xs text-text-muted">
        Be the first to say hello.
      </p>
    </div>
  );
}

function MessagesSkeleton() {
  return (
    <ul className="space-y-3 p-3 animate-chat-fade-in" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => {
        const own = i % 2 === 0;
        return (
          <li
            key={i}
            className={cn(
              "flex items-end gap-2 px-1",
              own ? "justify-end" : "justify-start",
            )}
          >
            {!own ? (
              <div className="h-8 w-8 rounded-full bg-bg-subtle animate-pulse" />
            ) : null}
            <div
              className={cn(
                "h-9 rounded-2xl bg-bg-subtle animate-pulse",
                own ? "rounded-br-sm" : "rounded-bl-sm",
              )}
              style={{ width: `${44 + ((i * 23) % 30)}%` }}
            />
          </li>
        );
      })}
    </ul>
  );
}

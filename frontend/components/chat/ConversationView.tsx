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
} from "@/hooks/useConversations";
import { conversationsQueryKey } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import { useTyping } from "@/hooks/useTyping";
import { usePresence, formatLastSeen } from "@/hooks/usePresence";
import { useSocket } from "@/hooks/useSocket";
import { SOCKET_EVENTS } from "@/types/socket";
import type { ReceiptReadPayload } from "@/types/socket";
import { Avatar } from "./Avatar";
import { PresenceDot } from "./PresenceDot";
import { MessageBubble } from "./MessageBubble";
import { MessageComposer } from "./MessageComposer";
import { TypingIndicator } from "./TypingIndicator";
import { Button } from "@/components/ui/Button";
import { usePresenceStore } from "@/stores/presence-store";

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
  const setPresence = usePresenceStore((s) => s.setPresence);

  const conversationQuery = useQuery<ConversationListItem>({
    queryKey: ["conversation", conversationId],
    queryFn: () => chatApi.getConversation(conversationId),
    staleTime: 60_000,
  });

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
    if (!otherUser.presenceStatus) return;
    setPresence(otherUser.id, {
      status: otherUser.presenceStatus,
      lastSeen:
        otherUser.lastSeenVisible === false
          ? null
          : (otherUser.lastSeenAt ?? null),
    });
  }, [
    otherUser?.id,
    otherUser?.presenceStatus,
    otherUser?.lastSeenAt,
    otherUser?.lastSeenVisible,
    setPresence,
  ]);
  const presence = usePresence(otherUser?.id);
  const headerName =
    conv?.type === "DM"
      ? (otherUser?.displayName ?? otherUser?.username ?? "Conversation")
      : (conv?.groupName ?? "Group chat");
  const headerSubtitle =
    conv?.type === "DM"
      ? formatLastSeen(presence)
      : `${conv?.members.length ?? 0} members`;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0 bg-bg">
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
      />

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
        disabled={!isConnected}
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
}: {
  loading: boolean;
  onBack: () => void;
  avatarSrc: string | null | undefined;
  name: string;
  subtitle: string;
  presenceStatus: import("@/types/auth").PresenceStatus | null;
  connected: boolean;
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
        {[
          { icon: Phone, label: "Voice call" },
          { icon: Video, label: "Video call" },
          { icon: MoreVertical, label: "Conversation info" },
        ].map(({ icon: Icon, label }) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            className={cn(
              "h-11 w-11 grid place-items-center rounded-full",
              "text-text-muted hover:bg-bg-subtle",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            )}
          >
            <Icon className="h-5 w-5" />
          </button>
        ))}
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

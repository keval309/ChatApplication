"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Search, Plus, MessageSquarePlus } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { useConversations } from "@/hooks/useConversations";
import { useMe } from "@/hooks/useAuth";
import { cn } from "@/lib/utils/cn";
import type { ConversationFilter } from "@/lib/chat-api";
import { ChatListItem } from "./ChatListItem";
import { Button } from "@/components/ui/Button";
import { NewChatDialog } from "./NewChatDialog";

const TABS: Array<{ value: ConversationFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "GROUPS", label: "Groups" },
  { value: "ARCHIVED", label: "Archived" },
];

function ListSkeleton() {
  return (
    <ul className="space-y-1 p-2 animate-chat-fade-in" aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 px-3 py-3 min-h-14"
        >
          <div className="h-12 w-12 rounded-full bg-bg-subtle animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div
              className="h-3 rounded bg-bg-subtle animate-pulse"
              style={{ width: `${50 + ((i * 13) % 30)}%` }}
            />
            <div
              className="h-2.5 rounded bg-bg-subtle animate-pulse"
              style={{ width: `${30 + ((i * 17) % 40)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ChatList() {
  const params = useParams<{ id?: string }>();
  const activeId = params?.id ?? null;
  const { data: me } = useMe();
  const [filter, setFilter] = React.useState<ConversationFilter>("ALL");
  const [searchInput, setSearchInput] = React.useState("");
  const [newChatOpen, setNewChatOpen] = React.useState(false);
  const search = useDebounce(searchInput, 300);

  const { conversations, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useConversations(filter);

  const filtered = React.useMemo(() => {
    if (!search) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c) => {
      const name =
        c.type === "DM"
          ? (c.otherUser?.displayName ?? c.otherUser?.username ?? "")
          : (c.groupName ?? "");
      return (
        name.toLowerCase().includes(q) ||
        (c.lastMessage?.content ?? "").toLowerCase().includes(q)
      );
    });
  }, [conversations, search]);

  return (
    <>
      <div className="flex flex-col h-full bg-bg-elevated border-r border-border min-w-0">
      <div className="p-3 space-y-3 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-text">Chats</h1>
          <button
            type="button"
            aria-label="New chat"
            onClick={() => setNewChatOpen(true)}
            className={cn(
              "h-9 w-9 grid place-items-center rounded-full",
              "bg-bg-subtle hover:bg-border text-text",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            )}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="relative">
          <Search
            aria-hidden
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted"
          />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className={cn(
              "w-full h-10 pl-9 pr-3 rounded-xl",
              "bg-bg-subtle text-text text-sm",
              "border border-transparent",
              "placeholder:text-text-muted",
              "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary",
            )}
          />
        </div>

        <div role="tablist" className="flex items-center gap-1.5">
          {TABS.map((t) => {
            const active = t.value === filter;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(t.value)}
                className={cn(
                  "h-8 px-3 rounded-full text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  active
                    ? "bg-primary text-text-inverse"
                    : "bg-bg-subtle text-text hover:bg-border",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" role="region" aria-label="Conversation list">
        {isLoading ? (
          <ListSkeleton />
        ) : isError ? (
          <div className="p-6 text-center space-y-3">
            <p className="text-sm text-text">We couldn&apos;t load your chats.</p>
            <Button size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center space-y-4 animate-chat-fade-in">
            <div className="mx-auto h-16 w-16 rounded-full bg-bg-subtle grid place-items-center text-text-muted">
              <MessageSquarePlus className="h-8 w-8" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-text">
                {search ? "No matches" : "No conversations yet"}
              </p>
              <p className="text-xs text-text-muted">
                {search
                  ? "Try a different search term."
                  : "Start a new chat to get going."}
              </p>
            </div>
            {!search ? (
              <Button
                size="sm"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() => setNewChatOpen(true)}
              >
                Start a new chat
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="py-1">
            {filtered.map((c) => (
              <ChatListItem
                key={c.id}
                conversation={c}
                isActive={c.id === activeId}
                selfUserId={me?.id ?? null}
              />
            ))}
            {hasNextPage ? (
              <li className="p-3 flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  loading={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                >
                  Load more
                </Button>
              </li>
            ) : null}
          </ul>
        )}
      </div>
      </div>
      <NewChatDialog open={newChatOpen} onClose={() => setNewChatOpen(false)} />
    </>
  );
}

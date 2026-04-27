"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Avatar } from "./Avatar";
import { PresenceDot } from "./PresenceDot";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useDebounce } from "@/hooks/useDebounce";
import { useDiscoverUsers, useMe } from "@/hooks/useAuth";
import { useGetOrCreateDm } from "@/hooks/useConversations";
import { toast } from "@/components/ui/Toaster";
import { extractErrorMessage } from "@/lib/api";

interface NewChatDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewChatDialog({ open, onClose }: NewChatDialogProps) {
  const router = useRouter();
  const { data: me } = useMe();
  const [query, setQuery] = React.useState("");
  const debounced = useDebounce(query, 250);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const getOrCreateDm = useGetOrCreateDm();
  const discover = useDiscoverUsers(debounced, { enabled: open, limit: 20 });

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-chat-title"
      className={cn(
        "fixed inset-0 z-50 bg-black/40 p-0 md:p-4",
        "flex items-end md:items-center justify-center animate-chat-fade-in",
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "w-full md:max-w-lg bg-bg-elevated rounded-t-2xl md:rounded-2xl shadow-xl",
          "animate-chat-slide-up pb-safe",
        )}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 id="new-chat-title" className="text-base font-semibold">
            New conversation
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={cn(
              "h-11 w-11 grid place-items-center rounded-full",
              "text-text-muted hover:bg-bg-subtle",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            )}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="p-4 border-b border-border">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, username, or email"
            aria-label="Search users"
            leftAdornment={<Search className="h-4 w-4" />}
          />
          <p className="text-xs text-text-muted mt-2">
            Type at least 2 characters.
          </p>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {debounced.trim().length < 2 ? (
            <p className="px-4 py-8 text-sm text-text-muted text-center">
              Search for someone to start a direct message.
            </p>
          ) : discover.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            </div>
          ) : discover.isError ? (
            <div className="p-6 text-center space-y-3">
              <p className="text-sm text-text">Couldn&apos;t load users.</p>
              <Button size="sm" variant="ghost" onClick={() => discover.refetch()}>
                Try again
              </Button>
            </div>
          ) : discover.data && discover.data.length > 0 ? (
            <ul className="py-1">
              {discover.data.map((u) => {
                const display = u.displayName ?? u.username ?? u.id;
                const subtitle = u.username
                  ? `@${u.username}`
                  : "No username set";
                const isSelf = u.id === me?.id;
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      disabled={isSelf || getOrCreateDm.isPending}
                      onClick={async () => {
                        try {
                          const conversation = await getOrCreateDm.mutateAsync(u.id);
                          onClose();
                          setQuery("");
                          router.push(`/chat/${conversation.id}`);
                        } catch (err) {
                          toast.error(extractErrorMessage(err));
                        }
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 text-left min-h-14",
                        "hover:bg-bg-subtle transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                      )}
                    >
                      <div className="relative shrink-0">
                        <Avatar src={u.avatarUrl} alt={display} size={40} />
                        <span className="absolute bottom-0 right-0">
                          <PresenceDot status={u.presenceStatus} size="sm" />
                        </span>
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-text truncate">
                          {display}
                        </span>
                        <span className="block text-xs text-text-muted truncate">
                          {isSelf ? "You" : subtitle}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-8 text-sm text-text-muted text-center">
              No users found.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}


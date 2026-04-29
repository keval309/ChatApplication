"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Search, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils/cn";
import * as chatApi from "@/lib/chat-api";
import { extractErrorMessage } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import { useDiscoverUsers, useMe } from "@/hooks/useAuth";
import type { DiscoverUser } from "@/types/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toaster";
import { Avatar } from "@/components/chat/Avatar";

export function CreateGroupScreen(): React.JSX.Element {
  const router = useRouter();
  const { data: me } = useMe();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [search, setSearch] = React.useState("");
  const debounced = useDebounce(search, 250);
  const [selectedMembers, setSelectedMembers] = React.useState<DiscoverUser[]>(
    [],
  );

  const discover = useDiscoverUsers(debounced, { enabled: true, limit: 20 });
  const selectedIds = React.useMemo(
    () => new Set(selectedMembers.map((u) => u.id)),
    [selectedMembers],
  );

  const create = useMutation({
    mutationFn: () =>
      chatApi.createGroup({
        name: name.trim(),
        description: description.trim() || null,
        memberIds: selectedMembers.map((u) => u.id),
      }),
    onSuccess: (r) => {
      toast.success("Group created.");
      router.push(`/chat/${r.conversationId}`);
    },
    onError: (err) => {
      toast.error(extractErrorMessage(err));
    },
  });

  const addMember = (u: DiscoverUser): void => {
    if (u.id === me?.id) return;
    setSelectedMembers((prev) => {
      if (prev.some((x) => x.id === u.id)) return prev;
      return [...prev, u];
    });
  };

  const removeMember = (id: string): void => {
    setSelectedMembers((prev) => prev.filter((u) => u.id !== id));
  };

  const canSubmit =
    name.trim().length >= 1 && selectedMembers.length >= 2 && !create.isPending;

  return (
    <div className="flex flex-col min-h-0 max-w-lg mx-auto w-full px-4 py-6 pb-safe">
      <header className="flex items-center gap-2 mb-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-11 w-11 p-0"
          aria-label="Back"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-medium text-text">New group</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Add a name and at least two other people (server requires 2+).
          </p>
        </div>
      </header>

      <div className="space-y-4 shrink-0">
        <div>
          <label htmlFor="group-name" className="text-sm font-medium text-text">
            Group name
          </label>
          <Input
            id="group-name"
            className="mt-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Weekend plans"
            maxLength={100}
            aria-required
          />
        </div>
        <div>
          <label
            htmlFor="group-desc"
            className="text-sm font-medium text-text"
          >
            Description{" "}
            <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <Input
            id="group-desc"
            className="mt-1.5"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this group about?"
            maxLength={500}
          />
        </div>
      </div>

      <div className="mt-6 flex-1 min-h-0 flex flex-col border-t border-border pt-4">
        <p className="text-sm font-medium text-text mb-2">Members</p>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search people to add"
          aria-label="Search people to add"
          leftAdornment={<Search className="h-4 w-4" />}
        />
        <p className="text-xs text-text-muted mt-2">
          Type at least 2 characters. You&apos;ll be added automatically.
        </p>

        <div className="mt-3 flex flex-wrap gap-2 min-h-8">
          {selectedMembers.map((u) => {
            const label = u.displayName ?? u.username ?? u.id;
            return (
              <span
                key={u.id}
                className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-full bg-bg-subtle border border-border text-xs text-text"
              >
                {label}
                <button
                  type="button"
                  aria-label={`Remove ${label}`}
                  onClick={() => removeMember(u.id)}
                  className="h-7 w-7 grid place-items-center rounded-full hover:bg-bg-elevated text-text-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            );
          })}
        </div>

        <ul className="mt-3 flex-1 overflow-y-auto rounded-xl border border-border divide-y divide-border max-h-[45dvh] md:max-h-80">
          {debounced.trim().length < 2 ? (
            <li className="px-3 py-8 text-sm text-text-muted text-center">
              Search to add people.
            </li>
          ) : discover.isLoading ? (
            <li className="py-10 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            </li>
          ) : discover.isError ? (
            <li className="px-3 py-6 text-center space-y-2">
              <p className="text-sm text-text">Couldn&apos;t load users.</p>
              <Button size="sm" variant="ghost" onClick={() => discover.refetch()}>
                Try again
              </Button>
            </li>
          ) : discover.data && discover.data.length > 0 ? (
            discover.data.map((u) => {
              const isSelf = u.id === me?.id;
              const on = selectedIds.has(u.id);
              const label = u.displayName ?? u.username ?? u.id;
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    disabled={isSelf}
                    onClick={() => (on ? removeMember(u.id) : addMember(u))}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 min-h-14 text-left",
                      "hover:bg-bg-subtle transition-colors",
                      on && "bg-bg-subtle",
                      isSelf && "opacity-50",
                    )}
                  >
                    <Avatar src={u.avatarUrl} alt="" size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text truncate">
                        {label}
                        {isSelf ? " (you)" : ""}
                      </p>
                      {u.username ? (
                        <p className="text-xs text-text-muted truncate">
                          @{u.username}
                        </p>
                      ) : null}
                    </div>
                    {isSelf ? null : on ? (
                      <span className="text-xs font-medium text-primary">
                        Added
                      </span>
                    ) : (
                      <span className="text-xs text-text-muted">Add</span>
                    )}
                  </button>
                </li>
              );
            })
          ) : (
            <li className="px-3 py-8 text-sm text-text-muted text-center">
              No users found.
            </li>
          )}
        </ul>
      </div>

      <div className="mt-6 flex gap-2 shrink-0">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1"
          loading={create.isPending}
          disabled={!canSubmit}
          onClick={() => create.mutate()}
        >
          Create group
        </Button>
      </div>
    </div>
  );
}

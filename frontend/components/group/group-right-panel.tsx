"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Users, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import * as chatApi from "@/lib/chat-api";
import type { ConversationFilter } from "@/lib/chat-api";
import type { ConversationListItem, ConversationMember } from "@/types/chat";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/ui/Toaster";
import { Avatar } from "@/components/chat/Avatar";
import { conversationsQueryKey } from "@/hooks/conversation-list-cache";

function memberLabel(m: ConversationMember): string {
  return m.user.displayName ?? m.user.username ?? "Member";
}

function roleLabel(role: ConversationMember["role"]): string {
  if (role === "OWNER") return "Owner";
  if (role === "ADMIN") return "Admin";
  return "Member";
}

function memberJoinCaption(m: ConversationMember): string | null {
  const s = m.joinSource;
  if (!s || s === "UNKNOWN") return null;
  if (s === "INVITE") return "Joined via invite link";
  if (s === "DIRECT_ADD") return "Added by a member";
  if (s === "FOUNDING") return "Original member when group was created";
  return null;
}

interface GroupRightPanelProps {
  conversation: ConversationListItem;
  meId: string;
  open: boolean;
  onClose: () => void;
}

export function GroupRightPanel({
  conversation,
  meId,
  open,
  onClose,
}: GroupRightPanelProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const gi = conversation.groupInfo;
  const myMember = conversation.members.find((m) => m.userId === meId);
  const isOwner = myMember?.role === "OWNER";
  const isAdmin = myMember?.role === "ADMIN" || isOwner;

  const [confirmLeave, setConfirmLeave] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const invalidate = (): void => {
    void qc.invalidateQueries({ queryKey: ["conversation", conversation.id] });
    const filters: ConversationFilter[] = ["ALL", "ARCHIVED", "GROUPS"];
    for (const f of filters) {
      void qc.invalidateQueries({ queryKey: conversationsQueryKey(f) });
    }
  };

  const patchGroup = useMutation({
    mutationFn: (body: Parameters<typeof chatApi.patchGroupSettings>[1]) =>
      chatApi.patchGroupSettings(conversation.id, body),
    onSuccess: () => {
      invalidate();
      toast.success("Settings saved.");
    },
    onError: () => toast.error("Could not save settings."),
  });

  const leaveMut = useMutation({
    mutationFn: () => chatApi.leaveGroup(conversation.id),
    onSuccess: () => {
      toast.success("You left the group.");
      invalidate();
      onClose();
      router.push("/chat");
    },
    onError: () => toast.error("Could not leave group."),
  });

  const deleteMut = useMutation({
    mutationFn: () => chatApi.deleteConversation(conversation.id),
    onSuccess: () => {
      toast.success("Group deleted.");
      onClose();
      router.push("/chat");
    },
    onError: () => toast.error("Could not delete group."),
  });

  const inviteMut = useMutation({
    mutationFn: () => chatApi.createGroupInvite(conversation.id, {}),
    onSuccess: async (r) => {
      try {
        await navigator.clipboard.writeText(r.inviteUrl);
        toast.success("Invite link copied.");
      } catch {
        toast.success("Invite created — copy from URL in devtools if needed.");
      }
      invalidate();
    },
    onError: () => toast.error("Could not create invite."),
  });

  const unpinMut = useMutation({
    mutationFn: () => chatApi.unpinConversationMessage(conversation.id),
    onSuccess: () => invalidate(),
  });

  if (!open || !gi) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close group details"
        className="fixed inset-0 z-40 bg-black/40 md:hidden"
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed z-50 inset-y-0 right-0 w-full max-w-sm md:max-w-none",
          "md:relative md:z-0 md:w-[280px] md:shrink-0",
          "flex flex-col border-l border-border bg-bg-elevated shadow-xl md:shadow-none",
        )}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <p className="text-sm font-semibold text-text flex items-center gap-2">
            <Users className="h-4 w-4" aria-hidden />
            Group details
          </p>
          <button
            type="button"
            aria-label="Close panel"
            onClick={onClose}
            className="h-11 w-11 md:h-8 md:w-8 grid place-items-center rounded-full hover:bg-bg-subtle text-text-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-6 pb-safe">
          <section>
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
              Members ({conversation.members.length})
            </h3>
            <ul className="space-y-2">
              {conversation.members.map((m) => {
                const joinCap = memberJoinCaption(m);
                return (
                  <li key={m.userId} className="flex items-center gap-2 min-h-11">
                    <Avatar src={m.user.avatarUrl} alt="" size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text truncate">
                        {memberLabel(m)}
                      </p>
                      <p className="text-xs text-text-muted">{roleLabel(m.role)}</p>
                      {joinCap ? (
                        <p className="text-xs text-text-muted/90 mt-0.5">{joinCap}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            <details className="mt-3 rounded-xl border border-border bg-bg px-3 py-2 text-xs text-text-muted group">
              <summary className="cursor-pointer font-medium text-text list-none flex items-center justify-between [&::-webkit-details-marker]:hidden">
                <span>How invite links &amp; members work</span>
                <span
                  className="text-text-muted transition-transform group-open:rotate-180"
                  aria-hidden
                >
                  ▾
                </span>
              </summary>
              <div className="mt-2 space-y-2 leading-relaxed">
                <p>
                  <strong className="text-text">Invite links:</strong> An admin
                  can create a link and share it outside the app. The recipient
                  opens the link (they must be signed in), then taps{" "}
                  <strong className="text-text">Join group</strong> to enter this
                  chat.
                </p>
                <p>
                  <strong className="text-text">Member lines:</strong> Under
                  someone&apos;s role you may see whether they were an{" "}
                  <strong className="text-text">original member</strong>,{" "}
                  <strong className="text-text">added by a member</strong>, or{" "}
                  <strong className="text-text">joined via invite link</strong>.
                </p>
              </div>
            </details>
          </section>

          {isAdmin ? (
            <section className="space-y-3">
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide">
                Settings
              </h3>
              <label className="block text-xs text-text-muted" htmlFor="slow-mode">
                Slow mode
              </label>
              <select
                id="slow-mode"
                className="w-full rounded-lg border border-border bg-bg px-2 py-2 text-sm"
                value={gi.slowModeSeconds}
                onChange={(e) => {
                  patchGroup.mutate({ slowModeSeconds: Number(e.target.value) });
                }}
                disabled={patchGroup.isPending}
              >
                <option value={0}>Off</option>
                <option value={1}>1 second</option>
                <option value={5}>5 seconds</option>
                <option value={10}>10 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={60}>1 minute</option>
                <option value={300}>5 minutes</option>
              </select>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-text">Who can add members</span>
                <select
                  className="rounded-lg border border-border bg-bg px-2 py-2 text-sm"
                  value={gi.whoCanAddMembers}
                  onChange={(e) =>
                    patchGroup.mutate({
                      whoCanAddMembers: e.target.value as chatApi.WhoCanSetting,
                    })
                  }
                  disabled={patchGroup.isPending}
                >
                  <option value="EVERYONE">Everyone</option>
                  <option value="ADMINS_ONLY">Admins only</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-text">Announcement mode</span>
                <select
                  className="rounded-lg border border-border bg-bg px-2 py-2 text-sm"
                  value={gi.whoCanSendMessages}
                  onChange={(e) =>
                    patchGroup.mutate({
                      whoCanSendMessages: e.target.value as chatApi.WhoCanSetting,
                    })
                  }
                  disabled={patchGroup.isPending}
                >
                  <option value="EVERYONE">Off</option>
                  <option value="ADMINS_ONLY">Admins only</option>
                </select>
              </label>

              <label className="block text-xs text-text-muted" htmlFor="hist">
                History for new members
              </label>
              <select
                id="hist"
                className="w-full rounded-lg border border-border bg-bg px-2 py-2 text-sm"
                value={gi.messageHistoryForNewMembers}
                onChange={(e) =>
                  patchGroup.mutate({
                    messageHistoryForNewMembers: e.target
                      .value as chatApi.MessageHistoryPolicy,
                  })
                }
                disabled={patchGroup.isPending}
              >
                <option value="FULL">Full</option>
                <option value="LAST_7_DAYS">Last 7 days</option>
                <option value="NONE">None</option>
              </select>
            </section>
          ) : null}

          {isAdmin ? (
            <section className="space-y-2">
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide">
                Invite link
              </h3>
              <p className="text-xs text-text-muted leading-relaxed">
                Creates a shareable URL. Recipients open it while signed in and
                tap Join — they&apos;ll appear under members as{" "}
                <span className="text-text">Joined via invite link</span>.
              </p>
              <Button
                size="sm"
                variant="outline"
                loading={inviteMut.isPending}
                onClick={() => inviteMut.mutate()}
              >
                Generate & copy invite link
              </Button>
              {conversation.pinnedMessageId ? (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={unpinMut.isPending}
                  onClick={() => unpinMut.mutate()}
                >
                  Unpin message
                </Button>
              ) : null}
            </section>
          ) : null}

          <section className="pt-4 border-t border-border space-y-2">
            <h3 className="text-xs font-medium text-destructive">Danger zone</h3>
            {!isOwner ? (
              <Button
                size="sm"
                variant="ghost"
                className="w-full justify-start text-text"
                onClick={() => setConfirmLeave(true)}
              >
                Leave group
              </Button>
            ) : null}
            {isOwner ? (
              <Button
                size="sm"
                variant="destructive"
                className="w-full"
                onClick={() => setConfirmDelete(true)}
              >
                Delete group
              </Button>
            ) : null}
          </section>
        </div>

        <ConfirmDialog
          open={confirmLeave}
          title="Leave this group?"
          description="You will no longer receive messages from this group."
          confirmLabel="Leave"
          destructive
          loading={leaveMut.isPending}
          onConfirm={() => leaveMut.mutate()}
          onCancel={() => setConfirmLeave(false)}
        />
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this group?"
          description="This will permanently delete the group and all messages for every member. This cannot be undone."
          confirmLabel="Delete group"
          destructive
          loading={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate()}
          onCancel={() => setConfirmDelete(false)}
        />
      </aside>
    </>
  );
}

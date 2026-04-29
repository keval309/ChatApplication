"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import * as chatApi from "@/lib/chat-api";
import { extractErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toaster";

export default function JoinGroupPage(): React.JSX.Element {
  const params = useParams<{ inviteCode: string }>();
  const router = useRouter();
  const code = decodeURIComponent(params.inviteCode ?? "");

  const join = useMutation({
    mutationFn: () => chatApi.joinGroupByInvite(code),
    onSuccess: (r) => {
      toast.success("You joined the group.");
      router.replace(`/chat/${r.conversationId}`);
    },
    onError: (err) => {
      toast.error(extractErrorMessage(err));
    },
  });

  if (!code) {
    return (
      <div className="p-6 text-center text-sm text-text-muted">
        Invalid invite link.
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-medium text-text">Join group</h1>
        <p className="text-sm text-text-muted mt-1">
          You&apos;ve been invited with code{" "}
          <span className="font-mono text-text">{code}</span>
        </p>
        <p className="text-xs text-text-muted mt-3 leading-relaxed rounded-xl border border-border bg-bg-subtle px-3 py-2">
          An admin shared a group invite with you. After you join, you&apos;ll be
          listed in the group as someone who{" "}
          <strong className="text-text">joined via invite link</strong>.
        </p>
      </div>
      <Button
        type="button"
        className="w-full"
        loading={join.isPending}
        onClick={() => join.mutate()}
      >
        Join group
      </Button>
    </div>
  );
}

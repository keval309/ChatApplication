"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  Smile,
  CornerUpLeft,
  Pencil,
  Trash2,
  Copy,
  Forward,
  MoreHorizontal,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Message } from "@/types/chat";
import { toast } from "@/components/ui/Toaster";

const QUICK_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const EmojiMart = dynamic(() => import("@emoji-mart/react"), {
  ssr: false,
  loading: () => (
    <div className="h-72 w-72 grid place-items-center bg-bg-subtle rounded-lg">
      <Loader2 className="h-5 w-5 animate-spin text-text-muted" aria-hidden />
    </div>
  ),
});

interface BubbleActionsProps {
  message: Message;
  isOwn: boolean;
  visible: boolean;
  onReply: (m: Message) => void;
  onReact: (emoji: string) => void;
  onEdit?: (m: Message) => void;
  onDelete?: (m: Message) => void;
  canEdit: boolean;
}

/**
 * Floating action toolbar shown above a hovered (desktop) or long-pressed
 * (mobile) bubble. Includes 6 quick-reaction emojis, a `+` button to open
 * EmojiMart for the full picker, plus Reply / Edit / Delete / Copy / Forward.
 */
export function BubbleActions({
  message,
  isOwn,
  visible,
  onReply,
  onReact,
  onEdit,
  onDelete,
  canEdit,
}: BubbleActionsProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [pickerPlacement, setPickerPlacement] = React.useState<"top" | "bottom">(
    "bottom",
  );
  const actionsRef = React.useRef<HTMLDivElement | null>(null);

  React.useLayoutEffect(() => {
    if (!visible || !pickerOpen) return;

    const PICKER_HEIGHT = 360;
    const GAP = 8;
    const computePlacement = () => {
      const anchor = actionsRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const availableBelow = window.innerHeight - rect.bottom - GAP;
      setPickerPlacement(availableBelow >= PICKER_HEIGHT ? "bottom" : "top");
    };

    computePlacement();
    window.addEventListener("resize", computePlacement);
    window.addEventListener("scroll", computePlacement, true);
    return () => {
      window.removeEventListener("resize", computePlacement);
      window.removeEventListener("scroll", computePlacement, true);
    };
  }, [pickerOpen, visible]);

  if (!visible) return null;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy text");
    }
  };

  return (
    <div
      ref={actionsRef}
      className={cn(
        "absolute -top-9 z-20 flex items-center gap-1 px-1 py-1 rounded-full",
        "bg-bg-elevated border border-border shadow-md animate-chat-fade-in",
        isOwn ? "right-2" : "left-2",
      )}
      role="toolbar"
      aria-label="Message actions"
    >
      {QUICK_EMOJI.map((e) => (
        <button
          key={e}
          type="button"
          aria-label={`React with ${e}`}
          onClick={() => onReact(e)}
          className={cn(
            "h-8 w-8 grid place-items-center rounded-full text-base",
            "hover:bg-bg-subtle",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          )}
        >
          <span aria-hidden>{e}</span>
        </button>
      ))}

      <button
        type="button"
        aria-label="More reactions"
        onClick={() => setPickerOpen((p) => !p)}
        className={cn(
          "h-8 w-8 grid place-items-center rounded-full",
          "text-text-muted hover:bg-bg-subtle hover:text-text",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        )}
      >
        <Smile className="h-4 w-4" />
      </button>

      <span className="w-px h-5 bg-border mx-0.5" aria-hidden />

      <button
        type="button"
        aria-label="Reply"
        onClick={() => onReply(message)}
        className={cn(
          "h-8 w-8 grid place-items-center rounded-full",
          "text-text-muted hover:bg-bg-subtle hover:text-text",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        )}
      >
        <CornerUpLeft className="h-4 w-4" />
      </button>

      <button
        type="button"
        aria-label="More"
        onClick={() => setMoreOpen((p) => !p)}
        className={cn(
          "h-8 w-8 grid place-items-center rounded-full",
          "text-text-muted hover:bg-bg-subtle hover:text-text",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {moreOpen ? (
        <div
          className={cn(
            "absolute top-9",
            isOwn ? "right-0" : "left-0",
            "min-w-44 rounded-xl bg-bg-elevated border border-border shadow-lg",
            "py-1 animate-chat-slide-up",
          )}
          role="menu"
        >
          <MenuItem icon={<Copy className="h-4 w-4" />} onClick={() => { setMoreOpen(false); onCopy(); }}>
            Copy
          </MenuItem>
          <MenuItem icon={<Forward className="h-4 w-4" />} disabled>
            Forward
          </MenuItem>
          {isOwn && canEdit ? (
            <MenuItem
              icon={<Pencil className="h-4 w-4" />}
              onClick={() => { setMoreOpen(false); onEdit?.(message); }}
            >
              Edit
            </MenuItem>
          ) : null}
          {isOwn ? (
            <MenuItem
              icon={<Trash2 className="h-4 w-4" />}
              destructive
              onClick={() => { setMoreOpen(false); onDelete?.(message); }}
            >
              Delete
            </MenuItem>
          ) : null}
        </div>
      ) : null}

      {pickerOpen ? (
        <div
          className={cn(
            "absolute z-30",
            pickerPlacement === "bottom" ? "top-9" : "bottom-9",
            isOwn ? "right-0" : "left-0",
          )}
        >
          <EmojiMart
            theme="auto"
            previewPosition="none"
            skinTonePosition="none"
            onEmojiSelect={(emoji: { native?: string }) => {
              if (emoji.native) onReact(emoji.native);
              setPickerOpen(false);
            }}
            data={async () => (await import("@emoji-mart/data")).default}
          />
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
  disabled,
  destructive,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 text-sm",
        "hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-none focus-visible:bg-bg-subtle",
        destructive ? "text-[color:var(--color-error)]" : "text-text",
      )}
    >
      <span className="text-text-muted shrink-0">{icon}</span>
      <span className="flex-1 text-left">{children}</span>
    </button>
  );
}

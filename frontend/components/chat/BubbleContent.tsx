"use client";

import * as React from "react";
import Image from "next/image";
import { Download, FileText, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Message } from "@/types/chat";
import { renderMarkdownLiteMemo } from "@/lib/markdown-lite";
import { formatBytes } from "@/lib/format";
import { MediaLightbox } from "./MediaLightbox";

interface BubbleContentProps {
  message: Message;
  isOwn: boolean;
  onOpenReply?: (parentId: string) => void;
}

/**
 * Inner content of a bubble: handles tombstones, reply pill, media variants,
 * and the markdown-lite text path. Intentionally markup-only — the
 * surrounding bubble shell (color, alignment, tail) lives in MessageBubble.
 */
export function BubbleContent({
  message,
  isOwn,
  onOpenReply,
}: BubbleContentProps) {
  if (message.deletedAt) {
    return (
      <span className="italic text-text-muted">This message was deleted</span>
    );
  }

  const replyParentId = message.parentId;

  return (
    <div className="flex flex-col gap-1.5">
      {replyParentId ? (
        <ReplyPreview parentId={replyParentId} isOwn={isOwn} onOpen={onOpenReply} />
      ) : null}

      {message.type === "TEXT" ? (
        <MarkdownText content={message.content} />
      ) : message.type === "IMAGE" ? (
        <ImageContent message={message} />
      ) : message.type === "GIF" ? (
        <GifContent message={message} />
      ) : message.type === "FILE" ? (
        <FileContent message={message} />
      ) : (
        <MarkdownText content={message.content} />
      )}
    </div>
  );
}

// ── Sub-renderers ────────────────────────────────────────────────────────────

function MarkdownText({ content }: { content: string }) {
  const html = React.useMemo(() => renderMarkdownLiteMemo(content), [content]);
  return (
    <div
      className={cn(
        "text-sm leading-relaxed break-words whitespace-pre-wrap",
        "[&_a]:underline [&_a]:underline-offset-2 [&_a]:hover:opacity-90",
        "[&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-black/10 [&_code]:text-[0.85em]",
        "[&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:bg-black/10 [&_pre]:text-[0.85em] [&_pre]:overflow-x-auto",
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ReplyPreview({
  parentId,
  isOwn,
  onOpen,
}: {
  parentId: string;
  isOwn: boolean;
  onOpen?: (parentId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(parentId)}
      className={cn(
        "text-left flex flex-col gap-0.5 px-2.5 py-1.5 rounded-md",
        "border-l-2",
        isOwn
          ? "border-text-inverse/60 bg-black/10 text-text-inverse/90"
          : "border-primary bg-primary/10 text-text",
        "hover:opacity-90 transition-opacity",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      )}
      aria-label="Jump to replied message"
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
        Reply
      </span>
      <span className="text-xs line-clamp-2 opacity-90">
        Tap to view original
      </span>
    </button>
  );
}

function imageDims(content: string): {
  src: string;
  width: number;
  height: number;
  blurDataURL?: string;
} {
  // Convention used by the (forthcoming) upload pipeline:
  //   "url|width=W|height=H|blur=DATAURI"
  // The basic shape is `url` only; we degrade gracefully when missing.
  const parts = content.split("|");
  const src = parts[0]?.trim() ?? "";
  let width = 800;
  let height = 600;
  let blurDataURL: string | undefined;
  for (const p of parts.slice(1)) {
    const [k, v] = p.split("=");
    if (!k || v === undefined) continue;
    if (k === "width") width = Number(v) || width;
    if (k === "height") height = Number(v) || height;
    if (k === "blur") blurDataURL = v;
  }
  return { src, width, height, blurDataURL };
}

function ImageContent({ message }: { message: Message }) {
  const { src, width, height, blurDataURL } = imageDims(message.content);
  const [open, setOpen] = React.useState(false);
  const aspect = width / height;
  const displayWidth = Math.min(360, width);
  const displayHeight = Math.round(displayWidth / aspect);

  if (!src) return <span className="italic text-text-muted">Image unavailable</span>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "block relative overflow-hidden rounded-lg",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        )}
        aria-label="Open image"
        style={{ width: displayWidth, height: displayHeight }}
      >
        <Image
          src={src}
          alt="Shared image"
          width={displayWidth}
          height={displayHeight}
          className="object-cover"
          placeholder={blurDataURL ? "blur" : "empty"}
          blurDataURL={blurDataURL}
          unoptimized={src.startsWith("data:") || src.startsWith("blob:")}
        />
      </button>
      {open ? (
        <MediaLightbox src={src} alt="Shared image" onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function GifContent({ message }: { message: Message }) {
  const { src, width, height } = imageDims(message.content);
  const aspect = width / height || 1;
  const displayWidth = Math.min(280, width);
  const displayHeight = Math.round(displayWidth / aspect);
  if (!src) return <span className="italic text-text-muted">GIF unavailable</span>;
  return (
    <div
      className="relative overflow-hidden rounded-lg"
      style={{ width: displayWidth, height: displayHeight }}
    >
      <Image
        src={src}
        alt="Shared GIF"
        width={displayWidth}
        height={displayHeight}
        className="object-cover"
        unoptimized
      />
      <span
        aria-hidden
        className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-black/60 text-white tracking-wider"
      >
        GIF
      </span>
    </div>
  );
}

function fileMeta(content: string): {
  url: string;
  name: string;
  size: number;
} {
  // Convention: "url|name=foo.pdf|size=1234"
  const parts = content.split("|");
  const url = parts[0]?.trim() ?? "";
  let name = "Attachment";
  let size = 0;
  for (const p of parts.slice(1)) {
    const [k, v] = p.split("=");
    if (!k || v === undefined) continue;
    if (k === "name") name = v;
    if (k === "size") size = Number(v) || 0;
  }
  return { url, name, size };
}

function FileContent({ message }: { message: Message }) {
  const { url, name, size } = fileMeta(message.content);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download
      className={cn(
        "flex items-center gap-3 p-2.5 rounded-lg",
        "bg-bg-elevated text-text border border-border",
        "hover:bg-bg-subtle transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      )}
    >
      <span className="h-10 w-10 rounded-md bg-bg-subtle text-text-muted grid place-items-center shrink-0">
        <FileText className="h-5 w-5" aria-hidden />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium truncate">{name}</span>
        {size > 0 ? (
          <span className="block text-xs text-text-muted">
            {formatBytes(size)}
          </span>
        ) : null}
      </span>
      <Download className="h-4 w-4 text-text-muted shrink-0" aria-hidden />
    </a>
  );
}

// Re-export for convenience in other modules.
export { MessageSquare };

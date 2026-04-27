"use client";

import * as React from "react";
import TextareaAutosize from "react-textarea-autosize";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/Button";

const MAX_LENGTH = 4_000;

interface EditMessageDialogProps {
  open: boolean;
  initialContent: string;
  loading?: boolean;
  onSubmit: (newContent: string) => void;
  onCancel: () => void;
}

/**
 * Modal for editing an in-window (≤15min) own message. Cancel keeps focus,
 * Save submits. Re-edits the local copy without leaking to other users until
 * the server acks via `message:updated`.
 */
export function EditMessageDialog({
  open,
  initialContent,
  loading,
  onSubmit,
  onCancel,
}: EditMessageDialogProps) {
  const [value, setValue] = React.useState(initialContent);
  const ref = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setValue(initialContent);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(initialContent.length, initialContent.length);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, initialContent, onCancel]);

  if (!open) return null;

  const trimmed = value.trim();
  const overLimit = value.length > MAX_LENGTH;
  const unchanged = trimmed === initialContent.trim();
  const canSave = trimmed.length > 0 && !overLimit && !unchanged && !loading;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-msg-title"
      className={cn(
        "fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4",
        "bg-black/40 animate-chat-fade-in",
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) onSubmit(trimmed);
        }}
        className={cn(
          "w-full md:max-w-md bg-bg-elevated text-text",
          "rounded-t-2xl md:rounded-2xl shadow-xl pb-safe",
          "animate-chat-slide-up",
        )}
      >
        <h2
          id="edit-msg-title"
          className="px-5 pt-5 pb-2 text-base font-semibold"
        >
          Edit message
        </h2>
        <div className="px-5 pb-3">
          <TextareaAutosize
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={loading}
            minRows={2}
            maxRows={8}
            aria-label="Edited message"
            className={cn(
              "w-full resize-none rounded-xl bg-bg-subtle border border-border",
              "px-3 py-2 text-sm text-text placeholder:text-text-muted",
              "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary",
              overLimit && "border-[color:var(--color-error)]",
            )}
          />
          {overLimit ? (
            <p
              className="mt-1 text-xs text-[color:var(--color-error)]"
              role="alert"
            >
              Message exceeds {MAX_LENGTH} characters.
            </p>
          ) : null}
        </div>
        <div className="px-5 py-3 flex justify-end gap-2 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSave} loading={loading}>
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { cn } from "@/lib/utils/cn";

interface UnreadBadgeProps {
  count: number;
  className?: string;
}

/**
 * Circular ≤9 / pill 10–99 / "99+" beyond — color is `--color-primary`,
 * but the count itself communicates the signal (color is not the only cue).
 */
export function UnreadBadge({ count, className }: UnreadBadgeProps) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  const isWide = count >= 10;
  return (
    <span
      aria-label={`${count} unread message${count === 1 ? "" : "s"}`}
      className={cn(
        "inline-flex items-center justify-center rounded-full",
        "bg-primary text-text-inverse text-xs font-semibold",
        "tabular-nums select-none",
        isWide ? "h-5 px-1.5" : "h-5 w-5",
        className,
      )}
    >
      {label}
    </span>
  );
}

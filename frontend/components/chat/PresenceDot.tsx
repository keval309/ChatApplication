"use client";

import { cn } from "@/lib/utils/cn";
import type { PresenceState } from "@/types/chat";

const STATUS_TONE: Record<PresenceState["status"], string> = {
  ONLINE: "bg-[color:var(--color-success)]",
  AWAY: "bg-[color:var(--color-warning)]",
  DND: "bg-[color:var(--color-error)]",
  INVISIBLE: "bg-[color:var(--color-text-muted)]",
  OFFLINE: "bg-[color:var(--color-text-muted)]",
};

const STATUS_LABEL: Record<PresenceState["status"], string> = {
  ONLINE: "Online",
  AWAY: "Away",
  DND: "Do not disturb",
  INVISIBLE: "Invisible",
  OFFLINE: "Offline",
};

interface PresenceDotProps {
  status: PresenceState["status"];
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Color-coded presence dot. NEVER the only signal — pair with a tooltip / label.
 * Border matches the panel bg so the dot reads as a halo on top of the avatar.
 */
export function PresenceDot({ status, size = "md", className }: PresenceDotProps) {
  const sizeClass =
    size === "sm" ? "h-2 w-2" : size === "lg" ? "h-3.5 w-3.5" : "h-3 w-3";

  return (
    <span
      role="status"
      aria-label={STATUS_LABEL[status]}
      title={STATUS_LABEL[status]}
      className={cn(
        "inline-block rounded-full border-2 border-bg-elevated",
        sizeClass,
        STATUS_TONE[status],
        className,
      )}
    />
  );
}

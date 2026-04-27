"use client";

import { usePresenceStore } from "@/stores/presence-store";
import type { PresenceState } from "@/types/chat";

const OFFLINE_FALLBACK: PresenceState = {
  status: "OFFLINE",
  lastSeen: null,
};

export function usePresence(userId: string | null | undefined): PresenceState {
  return usePresenceStore((s) =>
    userId ? s.presence[userId] ?? OFFLINE_FALLBACK : OFFLINE_FALLBACK,
  );
}

export { formatLastSeen, getPresence } from "@/stores/presence-store";

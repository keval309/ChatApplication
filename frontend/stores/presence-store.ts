"use client";

import { create } from "zustand";
import type { PresenceState } from "@/types/chat";

interface PresenceStoreState {
  presence: Record<string, PresenceState>;
  setPresence: (userId: string, state: PresenceState) => void;
  setMany: (
    items: Array<{ userId: string; state: PresenceState }>,
  ) => void;
  clear: () => void;
}

export const usePresenceStore = create<PresenceStoreState>((set) => ({
  presence: {},
  setPresence: (userId, state) =>
    set((s) => ({ presence: { ...s.presence, [userId]: state } })),
  setMany: (items) =>
    set((s) => {
      const next = { ...s.presence };
      for (const i of items) next[i.userId] = i.state;
      return { presence: next };
    }),
  clear: () => set({ presence: {} }),
}));

export function getPresence(userId: string): PresenceState {
  const map = usePresenceStore.getState().presence;
  return map[userId] ?? { status: "OFFLINE", lastSeen: null };
}

/**
 * Format presence for headers / list items per the streamChat doc:
 *   "Online" | "Last seen today at 3:42 PM" | "Last seen yesterday" |
 *   "Last seen Apr 20".
 */
export function formatLastSeen(state: PresenceState): string {
  if (state.status === "ONLINE") return "Online";
  if (state.status === "AWAY") return "Away";
  if (state.status === "DND") return "Do not disturb";
  if (state.status === "INVISIBLE") return "Invisible";
  if (!state.lastSeen) return "Offline";

  const seen = new Date(state.lastSeen);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);

  if (seen >= startOfToday) {
    const time = seen.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return `Last seen today at ${time}`;
  }
  if (seen >= startOfYesterday) return "Last seen yesterday";
  return `Last seen ${seen.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

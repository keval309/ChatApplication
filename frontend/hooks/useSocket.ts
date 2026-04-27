"use client";

import { useEffect, useState } from "react";
import { getSocket, type AppSocket } from "@/lib/socket";
import { usePresenceStore } from "@/stores/presence-store";
import { SOCKET_EVENTS } from "@/types/socket";
import type { PresenceChangedEvent } from "@/types/socket";
import type { ClientToServerEvents } from "@/types/socket";

export interface UseSocketResult {
  socket: AppSocket | null;
  isConnected: boolean;
}

/**
 * Mounts the singleton Socket.io client (cookie-authenticated by the backend).
 * Auto-tracks connection state and feeds presence updates into the Zustand
 * store. Mount this once at the app shell — children read state via
 * `useChatPresence` / `useMessages` etc.
 */
export function useSocket(): UseSocketResult {
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);
    setIsConnected(s.connected);

    const onConnect = () => {
      setIsConnected(true);
      if (process.env.NODE_ENV !== "production") {
        console.info("[socket] connected", s.id);
      }
    };
    const onDisconnect = (reason: string) => {
      setIsConnected(false);
      if (process.env.NODE_ENV !== "production") {
        console.info("[socket] disconnected", reason);
      }
    };
    const onError = (err: Error) => {
      console.warn("[socket] connect_error", err.message);
    };
    const onPresence = (payload: PresenceChangedEvent) => {
      usePresenceStore.getState().setPresence(payload.userId, {
        status: payload.status,
        lastSeen: payload.lastSeen,
      });
    };

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onError);
    s.on(SOCKET_EVENTS.PRESENCE_CHANGED, onPresence);

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("connect_error", onError);
      s.off(SOCKET_EVENTS.PRESENCE_CHANGED, onPresence);
    };
  }, []);

  return { socket, isConnected };
}

/**
 * Lightweight typed emit helper — discoverable + typesafe payload.
 * Falls back to a no-op when socket isn't ready (treat as fire-and-forget).
 */
export function useEmit() {
  const { socket } = useSocket();
  return function emit<E extends keyof ClientToServerEvents>(
    event: E,
    ...args: Parameters<ClientToServerEvents[E]>
  ) {
    if (!socket) return;
    (socket.emit as (e: E, ...a: Parameters<ClientToServerEvents[E]>) => void)(
      event,
      ...args,
    );
  };
}

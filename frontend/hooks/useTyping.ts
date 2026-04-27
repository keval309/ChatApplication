"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "./useSocket";
import {
  SOCKET_EVENTS,
  type TypingUpdateEvent,
} from "@/types/socket";

const DEBOUNCE_MS = 300;
const IDLE_STOP_MS = 3_000;
const STALE_TTL_MS = 4_000;

interface TypingState {
  /** Currently typing userIds in this conversation, freshness-checked. */
  typingUserIds: string[];
}

/**
 * Manages "X is typing…" state for a conversation.
 *
 * - Outgoing: leading-edge debounce on `start` (300ms), auto-stop after 3s idle
 *   or on blur.
 * - Incoming: keep a freshness map keyed by userId; clean entries older than 4s
 *   so we never show ghost-typers.
 */
export function useTyping(conversationId: string | null): TypingState & {
  notifyTyping: () => void;
  notifyStopped: () => void;
} {
  const { socket } = useSocket();
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const lastSeenRef = useRef<Map<string, number>>(new Map());

  const startSentAtRef = useRef<number>(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Periodically prune stale entries (every 1s) so the typing list always
  // reflects the last 4 seconds.
  useEffect(() => {
    if (!conversationId) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const map = lastSeenRef.current;
      let changed = false;
      for (const [uid, ts] of map) {
        if (now - ts > STALE_TTL_MS) {
          map.delete(uid);
          changed = true;
        }
      }
      if (changed) setTypingUserIds(Array.from(map.keys()));
    }, 1000);
    return () => clearInterval(interval);
  }, [conversationId]);

  // Subscribe to typing updates for this conversation.
  useEffect(() => {
    if (!socket || !conversationId) return;
    const onUpdate = (e: TypingUpdateEvent) => {
      if (e.conversationId !== conversationId) return;
      const now = Date.now();
      const map = lastSeenRef.current;
      const incoming = new Set(e.typingUserIds);
      // Refresh seen timestamps for those still typing
      for (const uid of incoming) map.set(uid, now);
      // Drop those no longer in the server's set
      for (const uid of Array.from(map.keys())) {
        if (!incoming.has(uid)) map.delete(uid);
      }
      setTypingUserIds(Array.from(map.keys()));
    };
    socket.on(SOCKET_EVENTS.TYPING_UPDATE, onUpdate);
    return () => {
      socket.off(SOCKET_EVENTS.TYPING_UPDATE, onUpdate);
      lastSeenRef.current.clear();
      setTypingUserIds([]);
    };
  }, [socket, conversationId]);

  const sendStop = useCallback(() => {
    if (!socket || !conversationId) return;
    if (startSentAtRef.current === 0) return;
    socket.emit(SOCKET_EVENTS.TYPING_STOP, { conversationId });
    startSentAtRef.current = 0;
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, [socket, conversationId]);

  const sendStart = useCallback(() => {
    if (!socket || !conversationId) return;
    const now = Date.now();
    if (now - startSentAtRef.current >= DEBOUNCE_MS) {
      socket.emit(SOCKET_EVENTS.TYPING_START, { conversationId });
      startSentAtRef.current = now;
    }
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(sendStop, IDLE_STOP_MS);
  }, [socket, conversationId, sendStop]);

  // Cleanup on unmount / conversation switch
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (startSentAtRef.current !== 0 && socket && conversationId) {
        socket.emit(SOCKET_EVENTS.TYPING_STOP, { conversationId });
        startSentAtRef.current = 0;
      }
    };
  }, [socket, conversationId]);

  return { typingUserIds, notifyTyping: sendStart, notifyStopped: sendStop };
}

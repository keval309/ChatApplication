"use client";

import { io, type Socket } from "socket.io-client";
import { API_URL } from "./api";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@/types/socket";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

/**
 * Get (or lazily create) the singleton Socket.io client. Cookies are sent
 * automatically (`withCredentials`) so the backend reads cf_access on the
 * handshake — no token plumbing needed in the client.
 */
export function getSocket(): AppSocket {
  if (typeof window === "undefined") {
    throw new Error("getSocket() must only be called from the browser");
  }
  if (!socket) {
    socket = io(API_URL, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: Infinity,
      autoConnect: true,
    }) as AppSocket;
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function isSocketConnected(): boolean {
  return Boolean(socket?.connected);
}

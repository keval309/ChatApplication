import type { Server as HttpServer } from "http";
import { Server as IOServer } from "socket.io";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { socketAuthMiddleware } from "./auth";
import { broadcastPresence, markOffline, markOnline } from "./presence";
import { userRoom } from "./rooms";
import { registerMessageHandlers } from "./handlers/message";
import { registerReactionHandlers } from "./handlers/reaction";
import { registerTypingHandlers } from "./handlers/typing";
import { registerReceiptHandlers } from "./handlers/receipt";
import type { AppIOServer, AppSocket } from "./types";

let ioInstance: AppIOServer | null = null;

/**
 * Attach Socket.io to the existing HTTP server. Same port, same process —
 * shares cookies + CORS with the Express side so the cf_access JWT is sent
 * automatically by the browser on the WebSocket handshake.
 */
export function attachSocketIO(httpServer: HttpServer): AppIOServer {
  if (ioInstance) return ioInstance;

  const io: AppIOServer = new IOServer(httpServer, {
    cors: {
      origin: env.FRONTEND_URL,
      credentials: true,
    },
    transports: ["websocket", "polling"],
    serveClient: false,
  });

  io.use(socketAuthMiddleware);

  io.on("connection", (socket: AppSocket) => {
    const { userId } = socket.data.auth;
    socket.join(userRoom(userId));

    const becameOnline = markOnline(userId, socket.id);
    if (becameOnline) {
      broadcastPresence(io, userId);
    }

    logger.info(
      `[socket] connected user=${userId} sid=${socket.id} ` +
        `total=${io.sockets.sockets.size}`,
    );

    registerMessageHandlers(io, socket);
    registerReactionHandlers(io, socket);
    registerTypingHandlers(io, socket);
    registerReceiptHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      const becameOffline = markOffline(userId, socket.id);
      if (becameOffline) {
        broadcastPresence(io, userId);
      }
      logger.info(
        `[socket] disconnected user=${userId} sid=${socket.id} reason=${reason}`,
      );
    });

    socket.on("error", (err) => {
      logger.error(`[socket] error user=${userId} sid=${socket.id}`, err);
    });
  });

  ioInstance = io;
  return io;
}

export function getSocketServer(): AppIOServer {
  if (!ioInstance) {
    throw new Error("Socket.io has not been initialized. Call attachSocketIO first.");
  }
  return ioInstance;
}

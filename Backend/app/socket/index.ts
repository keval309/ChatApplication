import type { Server as HttpServer } from "http";
import { Server as IOServer } from "socket.io";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { prisma } from "../client/prisma";
import { socketAuthMiddleware } from "./auth";
import {
  broadcastPresenceToRelevant,
  markOffline,
  markOnlineFromDb,
} from "./presence";
import { userRoom } from "./rooms";
import { registerMessageHandlers } from "./handlers/message";
import { registerReactionHandlers } from "./handlers/reaction";
import { registerTypingHandlers } from "./handlers/typing";
import { registerReceiptHandlers } from "./handlers/receipt";
import type { AppIOServer, AppSocket } from "./types";
import { messageService } from "../modules/message";
import { emitToUser } from "./rooms";
import { SOCKET_EVENTS } from "./events";

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

  io.on("connection", async (socket: AppSocket) => {
    const { userId } = socket.data.auth;
    socket.join(userRoom(userId));

    const becameOnline = await markOnlineFromDb(userId, socket.id);
    if (becameOnline) {
      void broadcastPresenceToRelevant(io, userId);
    }
    const deliveredUpdates = await messageService.catchUpDeliveredForRecipient({
      recipientId: userId,
    });
    for (const update of deliveredUpdates) {
      emitToUser(io, update.senderId, SOCKET_EVENTS.MESSAGE_DELIVERED, {
        messageId: update.messageId,
        conversationId: update.conversationId,
        deliveredAt: update.deliveredAt,
      });
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
        void prisma.user.update({
          where: { id: userId },
          data: { lastSeenAt: new Date(), presenceStatus: "OFFLINE" },
          select: { id: true },
        });
        void broadcastPresenceToRelevant(io, userId);
      }
      logger.info(
        `[socket] disconnected user=${userId} sid=${socket.id} reason=${reason}`,
      );
    });

    socket.on("error", (err) => {
      logger.error(`[socket] error user=${userId} sid=${socket.id}`, err);
    });
  });

  startAutoUnmuteJob(io);

  ioInstance = io;
  return io;
}

function startAutoUnmuteJob(io: AppIOServer): void {
  setInterval(() => {
    void (async () => {
      try {
        const now = new Date();
        const due = await prisma.conversationNotificationPreference.findMany({
          where: {
            isMuted: true,
            muteUntil: { not: null, lte: now },
          },
        });
        for (const row of due) {
          await prisma.conversationNotificationPreference.update({
            where: { id: row.id },
            data: { isMuted: false, muteUntil: null },
          });
          if (row.autoUnmuteReminder) {
            emitToUser(io, row.userId, SOCKET_EVENTS.NOTIFICATION_UNMUTED, {
              conversationId: row.conversationId,
            });
          }
        }
      } catch (err) {
        logger.error("[autoUnmute]", err as Error);
      }
    })();
  }, 60_000);
}

export function getSocketServer(): AppIOServer {
  if (!ioInstance) {
    throw new Error("Socket.io has not been initialized. Call attachSocketIO first.");
  }
  return ioInstance;
}

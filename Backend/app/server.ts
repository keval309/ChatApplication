import http from "http";
import { app } from "./index";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { attachSocketIO, getSocketServer } from "./socket";

const httpServer = http.createServer(app);

attachSocketIO(httpServer);

httpServer.listen(env.PORT, () => {
  logger.info(`Server started on port ${env.PORT}`);
  logger.info(`Socket.io listening at ws://localhost:${env.PORT}`);
});

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`[shutdown] received ${signal}, draining connections…`);

  const io = getSocketServer();
  try {
    await io.close();
    logger.info("[shutdown] socket.io closed");
  } catch (err) {
    logger.error("[shutdown] socket.io close failed", err as Error);
  }

  httpServer.close((err) => {
    if (err) {
      logger.error("[shutdown] httpServer close failed", err);
      process.exit(1);
    }
    logger.info("[shutdown] http server closed, exiting");
    process.exit(0);
  });

  setTimeout(() => {
    logger.error("[shutdown] forced exit after 10s");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("[unhandledRejection]", reason as Error);
});
process.on("uncaughtException", (err) => {
  logger.error("[uncaughtException]", err);
});

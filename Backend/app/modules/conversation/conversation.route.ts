import { Router } from "express";
import asyncHandler from "../../utils/async-handler";
import { ApiException } from "../../utils/errorHandler";
import { ErrorCodes } from "../../utils/response";
import { isAuthenticated } from "../../middleware/authMiddleware";
import type { RequestExtended } from "../../interfaces/global";
import { getSocketServer } from "../../socket";
import { SOCKET_EVENTS } from "../../socket/events";
import { emitToUser, emitToUsers } from "../../socket/rooms";
import * as conversationService from "./conversation.service";
import {
  archiveConversationValidator,
  conversationIdParam,
  getOrCreateDmValidator,
  listConversationsValidator,
  muteConversationValidator,
  setConversationPinnedValidator,
} from "./conversation.validator";

const router = Router();
router.use(isAuthenticated);

function requireUser(req: RequestExtended) {
  if (!req.user) {
    throw new ApiException({ ...ErrorCodes.UNAUTHORIZED });
  }
  return req.user;
}

router.get(
  "/",
  listConversationsValidator,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    const cursor = (req.query.cursor as string | undefined) ?? null;
    const filter =
      (req.query.filter as "ALL" | "ARCHIVED" | "GROUPS" | undefined) ?? "ALL";
    return conversationService.listForUser({
      userId: user.id,
      cursor,
      filter,
    });
  }),
);

router.post(
  "/dm",
  getOrCreateDmValidator,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    const otherUserId = String(req.body.userId);
    const conversation = await conversationService.getOrCreateDm({
      selfUserId: user.id,
      otherUserId,
    });
    return { conversation };
  }),
);

router.post(
  "/:id/archive",
  archiveConversationValidator,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    await conversationService.setArchived({
      userId: user.id,
      conversationId: String(req.params.id),
      archived: Boolean(req.body.archived),
    });
    return { success: true };
  }),
);

router.post(
  "/:id/read",
  conversationIdParam,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    await conversationService.markRead({
      userId: user.id,
      conversationId: String(req.params.id),
    });
    return { success: true };
  }),
);

router.post(
  "/:id/clear",
  conversationIdParam,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    const conversationId = String(req.params.id);
    const { actorUserId } = await conversationService.clearHistory({
      userId: user.id,
      conversationId,
    });
    try {
      const io = getSocketServer();
      emitToUser(io, actorUserId, SOCKET_EVENTS.CONVERSATION_HISTORY_CLEARED, {
        conversationId,
      });
    } catch {
      /* socket not initialized (e.g. tests) */
    }
    return { success: true };
  }),
);

router.delete(
  "/:id",
  conversationIdParam,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    const conversationId = String(req.params.id);
    const del = await conversationService.deleteConversationHard({
      userId: user.id,
      conversationId,
    });
    try {
      const io = getSocketServer();
      if (del.scope === "everyone") {
        emitToUsers(io, del.memberIds, SOCKET_EVENTS.CONVERSATION_DELETED, {
          conversationId,
        });
      } else {
        emitToUser(io, del.actorUserId, SOCKET_EVENTS.CONVERSATION_REMOVED_FOR_ME, {
          conversationId,
        });
      }
    } catch {
      /* socket not initialized */
    }
    return { success: true };
  }),
);

router.patch(
  "/:id/mute",
  muteConversationValidator,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    await conversationService.muteConversation({
      userId: user.id,
      conversationId: String(req.params.id),
      duration: req.body.duration,
      autoUnmuteReminder: Boolean(req.body.autoUnmuteReminder),
    });
    return { success: true };
  }),
);

router.patch(
  "/:id/unmute",
  conversationIdParam,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    await conversationService.unmuteConversation({
      userId: user.id,
      conversationId: String(req.params.id),
    });
    return { success: true };
  }),
);

router.patch(
  "/:id/pin",
  setConversationPinnedValidator,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    await conversationService.setMemberPinned({
      userId: user.id,
      conversationId: String(req.params.id),
      pinned: Boolean(req.body.pinned),
    });
    return { success: true };
  }),
);

router.get(
  "/:id",
  conversationIdParam,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    const conversation = await conversationService.getById({
      userId: user.id,
      conversationId: String(req.params.id),
    });
    return { conversation };
  }),
);

export default router;

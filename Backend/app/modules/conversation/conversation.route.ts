import { Router } from "express";
import asyncHandler from "../../utils/async-handler";
import { ApiException } from "../../utils/errorHandler";
import { ErrorCodes } from "../../utils/response";
import { isAuthenticated } from "../../middleware/authMiddleware";
import type { RequestExtended } from "../../interfaces/global";
import * as conversationService from "./conversation.service";
import {
  archiveConversationValidator,
  conversationIdParam,
  getOrCreateDmValidator,
  listConversationsValidator,
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

export default router;

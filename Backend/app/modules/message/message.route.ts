import { Router } from "express";
import asyncHandler from "../../utils/async-handler";
import { ApiException } from "../../utils/errorHandler";
import { ErrorCodes } from "../../utils/response";
import { isAuthenticated } from "../../middleware/authMiddleware";
import type { RequestExtended } from "../../interfaces/global";
import * as messageService from "./message.service";
import { listMessagesValidator } from "./message.validator";

/**
 * Sends are intentionally socket-only — there is no POST /messages here.
 * REST exposes ONLY the cursor-paginated history endpoint.
 */
const router = Router({ mergeParams: true });
router.use(isAuthenticated);

function requireUser(req: RequestExtended) {
  if (!req.user) throw new ApiException({ ...ErrorCodes.UNAUTHORIZED });
  return req.user;
}

router.get(
  "/conversations/:id/messages",
  listMessagesValidator,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    const cursor = (req.query.cursor as string | undefined) ?? null;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    return messageService.listForConversation({
      userId: user.id,
      conversationId: String(req.params.id),
      cursor,
      limit,
    });
  }),
);

export default router;

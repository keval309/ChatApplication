import { Router } from "express";
import asyncHandler from "../../utils/async-handler";
import { ApiException } from "../../utils/errorHandler";
import { ErrorCodes } from "../../utils/response";
import { isAuthenticated } from "../../middleware/authMiddleware";
import type { RequestExtended } from "../../interfaces/global";
import * as userService from "./user.service";
import {
  sessionIdParam,
  updateProfileValidator,
} from "./user.validator";

const router = Router();
router.use(isAuthenticated);

function requireUser(req: RequestExtended) {
  if (!req.user) {
    throw new ApiException({ ...ErrorCodes.UNAUTHORIZED });
  }
  return req.user;
}

router.get(
  "/me",
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    const profile = await userService.getProfile(user.id);
    return { user: profile };
  }),
);

router.patch(
  "/me",
  updateProfileValidator,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    const profile = await userService.updateProfile(user.id, {
      username: req.body.username,
      displayName: req.body.displayName,
      avatarUrl: req.body.avatarUrl,
      statusMessage: req.body.statusMessage,
      bio: req.body.bio,
    });
    return { user: profile };
  }),
);

router.get(
  "/me/sessions",
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    const sessions = await userService.listSessions({
      userId: user.id,
      currentSessionId: user.sessionId,
    });
    return { sessions };
  }),
);

router.delete(
  "/me/sessions/:id",
  sessionIdParam,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    await userService.revokeSession({
      userId: user.id,
      sessionId: String(req.params.id),
      currentSessionId: user.sessionId,
    });
    return { success: true };
  }),
);

export default router;

import { Router } from "express";
import asyncHandler from "../../utils/async-handler";
import type { RequestExtended } from "../../interfaces/global";
import { isAuthenticated } from "../../middleware/authMiddleware";
import ApiException from "../../utils/errorHandler";
import { ErrorCodes } from "../../utils/response";
import * as groupService from "./group.service";
import {
  addMembersValidator,
  conversationIdParam,
  createGroupValidator,
  createInviteValidator,
  inviteCodeParam,
  memberUserIdParam,
  patchGroupValidator,
  patchMemberRoleValidator,
  pinMessageValidator,
  transferOwnershipValidator,
} from "./group.validator";

const router = Router();
router.use(isAuthenticated);

function requireUser(req: RequestExtended) {
  if (!req.user) {
    throw new ApiException({ ...ErrorCodes.UNAUTHORIZED });
  }
  return req.user;
}

/** POST /api/conversations/group — must register before /:id routes that could collide. */
router.post(
  "/group",
  createGroupValidator,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    const conversationId = await groupService.createGroup({
      creatorId: user.id,
      body: {
        name: String(req.body.name),
        description: req.body.description ?? null,
        avatarUrl: req.body.avatarUrl ?? null,
        memberIds: req.body.memberIds as string[],
      },
    });
    return conversationId;
  }),
);

router.post(
  "/:id/members",
  addMembersValidator,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    return groupService.addMembers({
      conversationId: String(req.params.id),
      actorId: user.id,
      userIds: req.body.userIds as string[],
    });
  }),
);

router.delete(
  "/:id/members/:userId",
  memberUserIdParam,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    await groupService.removeMember({
      conversationId: String(req.params.id),
      actorId: user.id,
      targetUserId: String(req.params.userId),
    });
    return { success: true };
  }),
);

router.patch(
  "/:id/members/:userId/role",
  patchMemberRoleValidator,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    await groupService.changeMemberRole({
      conversationId: String(req.params.id),
      actorId: user.id,
      targetUserId: String(req.params.userId),
      role: req.body.role as "ADMIN" | "MEMBER",
    });
    return { success: true };
  }),
);

router.post(
  "/:id/transfer-ownership",
  transferOwnershipValidator,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    await groupService.transferOwnership({
      conversationId: String(req.params.id),
      actorId: user.id,
      newOwnerId: String(req.body.newOwnerId),
    });
    return { success: true };
  }),
);

router.patch(
  "/:id/group",
  patchGroupValidator,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    await groupService.patchGroupSettings({
      conversationId: String(req.params.id),
      actorId: user.id,
      body: {
        name: req.body.name as string | undefined,
        description: req.body.description as string | null | undefined,
        avatarUrl: req.body.avatarUrl as string | null | undefined,
        slowModeSeconds: req.body.slowModeSeconds as number | undefined,
        whoCanAddMembers: req.body.whoCanAddMembers as
          | "EVERYONE"
          | "ADMINS_ONLY"
          | undefined,
        whoCanSendMessages: req.body.whoCanSendMessages as
          | "EVERYONE"
          | "ADMINS_ONLY"
          | undefined,
        messageHistoryForNewMembers: req.body.messageHistoryForNewMembers as
          | "FULL"
          | "LAST_7_DAYS"
          | "NONE"
          | undefined,
      },
    });
    return { success: true };
  }),
);

router.post(
  "/:id/invite",
  createInviteValidator,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    return groupService.createOrRotateInvite({
      conversationId: String(req.params.id),
      actorId: user.id,
      body: {
        inviteCodeExpiresAt: req.body.inviteCodeExpiresAt ?? null,
        inviteCodeMaxUses: req.body.inviteCodeMaxUses ?? null,
      },
    });
  }),
);

router.delete(
  "/:id/invite",
  conversationIdParam,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    await groupService.deleteInvite({
      conversationId: String(req.params.id),
      actorId: user.id,
    });
    return { success: true };
  }),
);

router.patch(
  "/:id/pin",
  pinMessageValidator,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    await groupService.pinMessage({
      conversationId: String(req.params.id),
      actorId: user.id,
      messageId: String(req.body.messageId),
    });
    return { success: true };
  }),
);

router.delete(
  "/:id/pin",
  conversationIdParam,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    await groupService.unpinMessage({
      conversationId: String(req.params.id),
      actorId: user.id,
    });
    return { success: true };
  }),
);

router.post(
  "/:id/leave",
  conversationIdParam,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    await groupService.leaveGroup({
      conversationId: String(req.params.id),
      userId: user.id,
    });
    return { success: true };
  }),
);

export { router as groupConversationRouter };

const joinRouter = Router();
joinRouter.use(isAuthenticated);
joinRouter.post(
  "/:inviteCode",
  inviteCodeParam,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    return groupService.joinWithInvite({
      inviteCode: String(req.params.inviteCode),
      userId: user.id,
    });
  }),
);

export { joinRouter };

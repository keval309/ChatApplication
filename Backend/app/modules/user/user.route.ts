import { Router } from "express";
import path from "path";
import { promises as fs } from "fs";
import multer from "multer";
import sharp from "sharp";
import asyncHandler from "../../utils/async-handler";
import { env } from "../../config/env";
import { ApiException } from "../../utils/errorHandler";
import { ErrorCodes } from "../../utils/response";
import { isAuthenticated } from "../../middleware/authMiddleware";
import type { RequestExtended } from "../../interfaces/global";
import * as userService from "./user.service";
import {
  blockUserParamValidator,
  discoverUsersValidator,
  sessionIdParam,
  updateSettingsValidator,
  updateProfileValidator,
  upsertConversationPreferenceValidator,
  usernameAvailabilityValidator,
} from "./user.validator";

const router = Router();
router.use(isAuthenticated);
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

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
      presenceStatus: req.body.presenceStatus,
    });
    return { user: profile };
  }),
);

router.get(
  "/username-availability/:username",
  usernameAvailabilityValidator,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    const username = String(req.params.username);
    return userService.getUsernameAvailability(username, user.id);
  }),
);

router.get(
  "/discover",
  discoverUsersValidator,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    const q = String(req.query.q ?? "");
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const users = await userService.discoverUsers({
      userId: user.id,
      query: q,
      limit,
    });
    return { users };
  }),
);

router.get(
  "/me/settings",
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    const settings = await userService.getSettings(user.id);
    return { settings };
  }),
);

router.patch(
  "/me/settings",
  updateSettingsValidator,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    const settings = await userService.updateSettings(user.id, {
      lastSeenVisible:
        typeof req.body.lastSeenVisible === "boolean"
          ? req.body.lastSeenVisible
          : undefined,
      sendReadReceipts:
        typeof req.body.sendReadReceipts === "boolean"
          ? req.body.sendReadReceipts
          : undefined,
      globalNotificationLevel: req.body.globalNotificationLevel,
      autoUnmuteReminder:
        typeof req.body.autoUnmuteReminder === "boolean"
          ? req.body.autoUnmuteReminder
          : undefined,
    });
    return { settings };
  }),
);

router.get(
  "/me/conversation-preferences",
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    const preferences = await userService.listConversationPreferences(user.id);
    return { preferences };
  }),
);

router.post(
  "/me/conversation-preferences",
  upsertConversationPreferenceValidator,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    const preference = await userService.upsertConversationPreference(user.id, {
      conversationId: String(req.body.conversationId),
      notificationLevel: req.body.notificationLevel,
      isMuted:
        typeof req.body.isMuted === "boolean" ? req.body.isMuted : undefined,
      muteUntil: req.body.muteUntil ? new Date(String(req.body.muteUntil)) : undefined,
      autoUnmuteReminder:
        typeof req.body.autoUnmuteReminder === "boolean"
          ? req.body.autoUnmuteReminder
          : undefined,
    });
    return { preference };
  }),
);

router.get(
  "/me/blocked-users",
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    const blockedUsers = await userService.listBlockedUsers(user.id);
    return { blockedUsers };
  }),
);

router.post(
  "/me/blocked-users/:id",
  blockUserParamValidator,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    await userService.blockUser(user.id, String(req.params.id));
    return { success: true };
  }),
);

router.delete(
  "/me/blocked-users/:id",
  blockUserParamValidator,
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    await userService.unblockUser(user.id, String(req.params.id));
    return { success: true };
  }),
);

router.post(
  "/me/avatar",
  avatarUpload.single("avatar"),
  asyncHandler(async (req) => {
    const user = requireUser(req as RequestExtended);
    const file = req.file;
    if (!file) {
      throw new ApiException({
        ...ErrorCodes.BAD_REQUEST,
        errorDescription: "Avatar file is required",
      });
    }
    if (!file.mimetype.startsWith("image/")) {
      throw new ApiException({
        ...ErrorCodes.BAD_REQUEST,
        errorDescription: "Avatar must be an image",
      });
    }
    const processed = await sharp(file.buffer)
      .resize(256, 256, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();
    const uploadsDir = path.join(process.cwd(), "uploads", "avatars");
    await fs.mkdir(uploadsDir, { recursive: true });
    const filename = `${user.id}-${Date.now()}.webp`;
    const fullPath = path.join(uploadsDir, filename);
    await fs.writeFile(fullPath, processed);
    const avatarUrl = `${env.BACKEND_URL}/uploads/avatars/${filename}`;
    const profile = await userService.updateProfile(user.id, { avatarUrl });
    return { avatarUrl, user: profile };
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

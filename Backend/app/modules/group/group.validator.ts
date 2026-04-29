import { body, param } from "express-validator";

export const createGroupValidator = [
  body("name").isString().trim().notEmpty().isLength({ max: 100 }),
  body("description").optional().isString(),
  body("avatarUrl").optional().isString(),
  body("memberIds").isArray({ min: 1 }).withMessage("memberIds must be an array"),
  body("memberIds.*").isString().notEmpty(),
];

export const conversationIdParam = [
  param("id").isString().notEmpty().withMessage("conversationId is required"),
];

export const addMembersValidator = [
  ...conversationIdParam,
  body("userIds").isArray({ min: 1 }),
  body("userIds.*").isString().notEmpty(),
];

export const memberUserIdParam = [
  ...conversationIdParam,
  param("userId").isString().notEmpty(),
];

export const patchMemberRoleValidator = [
  ...memberUserIdParam,
  body("role").isIn(["ADMIN", "MEMBER"]),
];

export const transferOwnershipValidator = [
  ...conversationIdParam,
  body("newOwnerId").isString().notEmpty(),
];

export const patchGroupValidator = [
  ...conversationIdParam,
  body("name").optional().isString().trim().isLength({ min: 1, max: 100 }),
  body("description").optional({ values: "null" }).isString(),
  body("avatarUrl").optional({ values: "null" }).isString(),
  body("slowModeSeconds").optional().isInt({ min: 0, max: 3600 }),
  body("whoCanAddMembers")
    .optional()
    .isIn(["EVERYONE", "ADMINS_ONLY"]),
  body("whoCanSendMessages")
    .optional()
    .isIn(["EVERYONE", "ADMINS_ONLY"]),
  body("messageHistoryForNewMembers")
    .optional()
    .isIn(["FULL", "LAST_7_DAYS", "NONE"]),
];

export const createInviteValidator = [
  ...conversationIdParam,
  body("inviteCodeExpiresAt").optional({ values: "null" }).isISO8601(),
  body("inviteCodeMaxUses").optional({ values: "null" }).isInt({ min: 1 }),
];

export const inviteCodeParam = [
  param("inviteCode").isString().trim().notEmpty(),
];

export const pinMessageValidator = [
  ...conversationIdParam,
  body("messageId").isString().notEmpty(),
];

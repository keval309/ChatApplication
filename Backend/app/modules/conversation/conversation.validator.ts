import { body, param, query } from "express-validator";

export const listConversationsValidator = [
  query("cursor").optional().isString().isLength({ max: 64 }),
  query("filter")
    .optional()
    .isIn(["ALL", "ARCHIVED", "GROUPS"])
    .withMessage("filter must be ALL | ARCHIVED | GROUPS"),
];

export const getOrCreateDmValidator = [
  body("userId").isString().notEmpty().withMessage("userId is required"),
];

export const conversationIdParam = [
  param("id").isString().notEmpty().withMessage("conversationId is required"),
];

export const archiveConversationValidator = [
  ...conversationIdParam,
  body("archived")
    .isBoolean()
    .withMessage("archived must be a boolean")
    .toBoolean(),
];

export const muteConversationValidator = [
  ...conversationIdParam,
  body("duration")
    .isIn(["1h", "8h", "1d", "7d", "forever"])
    .withMessage("duration must be 1h | 8h | 1d | 7d | forever"),
  body("autoUnmuteReminder")
    .isBoolean()
    .withMessage("autoUnmuteReminder must be a boolean")
    .toBoolean(),
];

/** Inbox-only: float chat in your list — not shared message pin. */
export const setInboxPinnedValidator = [
  ...conversationIdParam,
  body("pinned")
    .isBoolean()
    .withMessage("pinned must be a boolean")
    .toBoolean(),
];

/** @deprecated Use setInboxPinnedValidator */
export const setConversationPinnedValidator = setInboxPinnedValidator;

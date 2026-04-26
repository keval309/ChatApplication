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

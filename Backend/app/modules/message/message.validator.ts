import { param, query } from "express-validator";

export const listMessagesValidator = [
  param("id").isString().notEmpty().withMessage("conversationId is required"),
  query("cursor").optional().isString().isLength({ max: 64 }),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100")
    .toInt(),
];

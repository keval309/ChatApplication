import { body, param } from "express-validator";

export const updateProfileValidator = [
  body("username")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage("Username must be 3–30 characters")
    .matches(/^[a-zA-Z0-9_.-]+$/)
    .withMessage("Username may contain letters, numbers, underscores, dots, and dashes"),
  body("displayName")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Display name must be 2–50 characters"),
  body("avatarUrl")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isURL()
    .withMessage("Avatar URL must be a valid URL"),
  body("statusMessage")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Status message must be at most 100 characters"),
  body("bio")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 300 })
    .withMessage("Bio must be at most 300 characters"),
];

export const sessionIdParam = [
  param("id").isString().notEmpty().withMessage("Session id is required"),
];

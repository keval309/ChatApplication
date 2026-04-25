import { body, param } from "express-validator";

const PRESENCE_STATUSES = ["ONLINE", "AWAY", "DND", "INVISIBLE", "OFFLINE"];
const NOTIFICATION_LEVELS = [
  "ALL_MESSAGES",
  "MENTIONS_AND_REPLIES",
  "NOTHING",
];

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
    .isURL({
      require_protocol: true,
      require_tld: false,
      protocols: ["http", "https"],
    })
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
  body("presenceStatus")
    .optional()
    .isIn(PRESENCE_STATUSES)
    .withMessage("Presence status is invalid"),
];

export const sessionIdParam = [
  param("id").isString().notEmpty().withMessage("Session id is required"),
];

export const usernameAvailabilityValidator = [
  param("username")
    .isString()
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage("Username must be 3-30 characters")
    .matches(/^[a-zA-Z0-9_.-]+$/)
    .withMessage("Username may contain letters, numbers, underscores, dots, and dashes"),
];

export const updateSettingsValidator = [
  body("lastSeenVisible")
    .optional()
    .isBoolean()
    .withMessage("lastSeenVisible must be a boolean"),
  body("sendReadReceipts")
    .optional()
    .isBoolean()
    .withMessage("sendReadReceipts must be a boolean"),
  body("globalNotificationLevel")
    .optional()
    .isIn(NOTIFICATION_LEVELS)
    .withMessage("Invalid global notification level"),
  body("autoUnmuteReminder")
    .optional()
    .isBoolean()
    .withMessage("autoUnmuteReminder must be a boolean"),
];

export const upsertConversationPreferenceValidator = [
  body("conversationId")
    .isString()
    .notEmpty()
    .withMessage("conversationId is required"),
  body("notificationLevel")
    .optional()
    .isIn(NOTIFICATION_LEVELS)
    .withMessage("Invalid notification level"),
  body("isMuted")
    .optional()
    .isBoolean()
    .withMessage("isMuted must be a boolean"),
  body("muteUntil")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("muteUntil must be a valid timestamp"),
  body("autoUnmuteReminder")
    .optional()
    .isBoolean()
    .withMessage("autoUnmuteReminder must be a boolean"),
];

export const blockUserParamValidator = [
  param("id").isString().notEmpty().withMessage("User id is required"),
];

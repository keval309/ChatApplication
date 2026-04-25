import { body, query } from "express-validator";

const passwordRule = body("password")
  .isString()
  .withMessage("Password is required")
  .isLength({ min: 8, max: 128 })
  .withMessage("Password must be between 8 and 128 characters");

const newPasswordRule = body("newPassword")
  .isString()
  .withMessage("New password is required")
  .isLength({ min: 8, max: 128 })
  .withMessage("New password must be between 8 and 128 characters");

const emailRule = body("email")
  .isString()
  .withMessage("Email is required")
  .trim()
  .isEmail()
  .withMessage("Provide a valid email address")
  .normalizeEmail({ all_lowercase: true });

export const registerValidator = [emailRule, passwordRule];

export const loginValidator = [
  emailRule,
  body("password").isString().withMessage("Password is required").notEmpty(),
  body("rememberMe").optional().isBoolean().toBoolean(),
];

export const verifyEmailValidator = [
  body("token").isString().withMessage("Token is required").notEmpty(),
];

export const resendVerificationValidator = [emailRule];

export const forgotPasswordValidator = [emailRule];

export const resetPasswordValidator = [
  body("token").isString().withMessage("Token is required").notEmpty(),
  newPasswordRule,
];

export const googleCallbackValidator = [
  query("code").isString().withMessage("Missing authorization code").notEmpty(),
  query("state").isString().withMessage("Missing state").notEmpty(),
];

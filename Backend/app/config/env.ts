import path from "path";
import { z } from "zod";

require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const booleanFromString = z
  .union([z.string(), z.boolean()])
  .transform((v) => (typeof v === "boolean" ? v : v.toLowerCase() === "true"));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 chars"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 chars"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  JWT_REFRESH_REMEMBER_EXPIRES_IN: z.string().default("30d"),

  COOKIE_DOMAIN: z.string().default("localhost"),
  COOKIE_SECURE: booleanFromString.default(false),

  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  BACKEND_URL: z.string().url().default("http://localhost:8080"),

  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_REDIRECT_URI: z
    .string()
    .url()
    .default("http://localhost:8080/api/auth/google/callback"),

  EMAIL_TOKEN_SECRET: z.string().min(16).default("dev-email-token-secret-change-me"),
  PASSWORD_RESET_SECRET: z
    .string()
    .min(16)
    .default("dev-password-reset-secret-change-me"),

  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanFromString.default(false),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default("streamChat <no-reply@streamchat.local>"),

  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_LOGIN_WINDOW_MIN: z.coerce.number().int().positive().default(15),
  RATE_LIMIT_REGISTER_MAX: z.coerce.number().int().positive().default(3),
  RATE_LIMIT_REGISTER_WINDOW_HR: z.coerce.number().int().positive().default(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast on misconfiguration; do not log secrets.
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

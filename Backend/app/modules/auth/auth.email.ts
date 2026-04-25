import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
  });

  return cachedTransporter;
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function send({ to, subject, html, text }: SendArgs): Promise<void> {
  if (!env.SMTP_HOST) {
    logger.warn(
      `[email] SMTP_HOST not configured; skipping send. to=${to} subject="${subject}"`,
    );
    return;
  }

  try {
    await getTransporter().sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      html,
      text,
    });
  } catch (err) {
    logger.error(`[email] failed to send to=${to}`, err as Error);
    throw err;
  }
}

export async function sendVerificationEmail(args: {
  to: string;
  token: string;
}): Promise<void> {
  const link = `${env.FRONTEND_URL}/verify-email?token=${encodeURIComponent(args.token)}`;
  const subject = "Verify your streamChat email";
  const text = `Welcome to streamChat!\n\nVerify your email by clicking this link (valid for 24 hours):\n${link}\n\nIf you didn't create an account, you can safely ignore this email.`;
  const html = renderTemplate({
    title: "Verify your email",
    intro: "Welcome to streamChat! Confirm your email address to finish setting up your account.",
    ctaLabel: "Verify email",
    ctaHref: link,
    footer: "This link expires in 24 hours. If you didn't create an account, you can ignore this email.",
  });
  await send({ to: args.to, subject, html, text });
}

export async function sendPasswordResetEmail(args: {
  to: string;
  token: string;
}): Promise<void> {
  const link = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(args.token)}`;
  const subject = "Reset your streamChat password";
  const text = `We received a request to reset your password.\n\nClick the link to reset (valid for 1 hour):\n${link}\n\nIf you didn't request a reset, you can ignore this email.`;
  const html = renderTemplate({
    title: "Reset your password",
    intro: "We received a request to reset your streamChat password.",
    ctaLabel: "Reset password",
    ctaHref: link,
    footer: "This link expires in 1 hour. If you didn't request a reset, you can ignore this email.",
  });
  await send({ to: args.to, subject, html, text });
}

function renderTemplate(args: {
  title: string;
  intro: string;
  ctaLabel: string;
  ctaHref: string;
  footer: string;
}): string {
  // Inline styles only (email clients ignore most CSS); palette tokens duplicated as literals
  // since email clients can't read CSS variables. Source: chat-color-palette.mdc light theme.
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#F5F6F8;font-family:Inter,Arial,sans-serif;color:#1A1A1A;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:14px;padding:32px;">
      <tr><td>
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;line-height:1.25;">${args.title}</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#1A1A1A;">${args.intro}</p>
        <a href="${args.ctaHref}" style="display:inline-block;background:#635BFF;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:15px;font-weight:500;">${args.ctaLabel}</a>
        <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#6B7280;">${args.footer}</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

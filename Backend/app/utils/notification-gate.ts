import type { NotificationLevel } from "../generated/prisma/client";

/**
 * Whether to surface an extra push/toast signal (not whether to deliver message:new).
 */
export function shouldEmitNotificationPush(args: {
  level: NotificationLevel;
  recipientUsername: string | null;
  messageContent: string;
  parentMessageSenderId: string | null;
  recipientUserId: string;
}): boolean {
  if (args.level === "ALL_MESSAGES") return true;
  if (args.level === "NOTHING") return false;

  // MENTIONS_AND_REPLIES
  if (
    args.parentMessageSenderId !== null &&
    args.parentMessageSenderId === args.recipientUserId
  ) {
    return true;
  }
  const uname = args.recipientUsername?.trim();
  if (!uname) return false;
  return contentMentionsUsername(args.messageContent, uname);
}

/** @username at start or after whitespace; case-insensitive */
export function contentMentionsUsername(content: string, username: string): boolean {
  const lower = content.toLowerCase();
  const needle = `@${username.toLowerCase()}`;
  let i = lower.indexOf(needle);
  while (i !== -1) {
    const before = i === 0 ? " " : lower[i - 1];
    if (before === " " || before === "\n" || before === "\t" || before === "\r") {
      const after = lower[i + needle.length];
      if (
        after === undefined ||
        after === " " ||
        after === "\n" ||
        after === "\t" ||
        after === "\r"
      ) {
        return true;
      }
    }
    i = lower.indexOf(needle, i + 1);
  }
  return false;
}

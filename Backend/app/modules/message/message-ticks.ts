import type { MessageRow } from "./message.repository";

export interface ConvTickContext {
  type: "DM" | "GROUP";
  members: Array<{ userId: string; sendReadReceipts: boolean }>;
}

/**
 * Blue ticks: every member except sender who has sendReadReceipts must have a ReadReceipt.
 * Members with sendReadReceipts false are excluded from the requirement.
 */
export function computeAllRead(
  message: Pick<MessageRow, "senderId" | "readReceipts">,
  ctx: ConvTickContext,
): boolean {
  const readers = new Set(
    message.readReceipts
      .map((r) => r.userId)
      .filter((uid) => uid !== message.senderId),
  );
  const required = ctx.members.filter(
    (m) => m.userId !== message.senderId && m.sendReadReceipts,
  );
  if (required.length === 0) return true;
  return required.every((m) => readers.has(m.userId));
}

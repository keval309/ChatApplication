-- Add delivery and unread tracking fields for chat ticks and badges.
ALTER TABLE "messages"
ADD COLUMN "deliveredAt" TIMESTAMP(3);

ALTER TABLE "conversation_members"
ADD COLUMN "unreadCount" INTEGER NOT NULL DEFAULT 0;

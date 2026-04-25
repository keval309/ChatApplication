-- CreateEnum
CREATE TYPE "NotificationLevel" AS ENUM ('ALL_MESSAGES', 'MENTIONS_AND_REPLIES', 'NOTHING');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "autoUnmuteReminder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "globalNotificationLevel" "NotificationLevel" NOT NULL DEFAULT 'ALL_MESSAGES',
ADD COLUMN     "lastPresenceHeartbeatAt" TIMESTAMP(3),
ADD COLUMN     "lastSeenVisible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sendReadReceipts" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "blocks" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "notificationLevel" "NotificationLevel" NOT NULL DEFAULT 'ALL_MESSAGES',
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "muteUntil" TIMESTAMP(3),
    "autoUnmuteReminder" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blocks_blockerId_idx" ON "blocks"("blockerId");

-- CreateIndex
CREATE INDEX "blocks_blockedId_idx" ON "blocks"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "blocks_blockerId_blockedId_key" ON "blocks"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "conversation_notification_preferences_userId_idx" ON "conversation_notification_preferences"("userId");

-- CreateIndex
CREATE INDEX "conversation_notification_preferences_conversationId_idx" ON "conversation_notification_preferences"("conversationId");

-- CreateIndex
CREATE INDEX "conversation_notification_preferences_muteUntil_idx" ON "conversation_notification_preferences"("muteUntil");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_notification_preferences_userId_conversationId_key" ON "conversation_notification_preferences"("userId", "conversationId");

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_notification_preferences" ADD CONSTRAINT "conversation_notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

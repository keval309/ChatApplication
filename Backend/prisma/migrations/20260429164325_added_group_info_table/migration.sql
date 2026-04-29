/*
  Warnings:

  - A unique constraint covering the columns `[inviteCode]` on the table `group_info` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "conversation_members" ADD COLUMN     "mutedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "pinnedMessageId" TEXT;

-- AlterTable
ALTER TABLE "group_info" ADD COLUMN     "inviteCode" TEXT,
ADD COLUMN     "inviteCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "inviteCodeMaxUses" INTEGER,
ADD COLUMN     "inviteCodeUseCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "messageHistoryForNewMembers" TEXT NOT NULL DEFAULT 'FULL',
ADD COLUMN     "whoCanAddMembers" TEXT NOT NULL DEFAULT 'EVERYONE',
ADD COLUMN     "whoCanSendMessages" TEXT NOT NULL DEFAULT 'EVERYONE';

-- CreateIndex
CREATE UNIQUE INDEX "group_info_inviteCode_key" ON "group_info"("inviteCode");

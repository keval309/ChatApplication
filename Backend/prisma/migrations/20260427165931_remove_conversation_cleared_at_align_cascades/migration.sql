-- AlterTable
ALTER TABLE "conversation_members" ADD COLUMN     "leftAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "conversation_notification_preferences" ADD CONSTRAINT "conversation_notification_preferences_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

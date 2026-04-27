-- AlterTable
ALTER TABLE "messages" ADD COLUMN "suppressedForUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

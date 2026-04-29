-- CreateEnum
CREATE TYPE "MemberJoinSource" AS ENUM ('UNKNOWN', 'FOUNDING', 'INVITE', 'DIRECT_ADD');

-- AlterTable
ALTER TABLE "conversation_members" ADD COLUMN "joinSource" "MemberJoinSource" NOT NULL DEFAULT 'UNKNOWN';

-- AlterEnum
ALTER TYPE "FieldSource" ADD VALUE 'RULE';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "priorityReason" TEXT;

-- CreateEnum
CREATE TYPE "AiCallType" AS ENUM ('CLASSIFICATION', 'DRAFT');

-- CreateEnum
CREATE TYPE "AiCallStatus" AS ENUM ('SUCCESS', 'FAILED', 'CAP_EXCEEDED');

-- DropIndex
DROP INDEX "Ticket_aiStatus_aiNextAttemptAt_idx";

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "aiLeaseExpiresAt" TIMESTAMP(3),
ADD COLUMN     "aiLeaseToken" TEXT;

-- CreateTable
CREATE TABLE "AiCall" (
    "id" SERIAL NOT NULL,
    "type" "AiCallType" NOT NULL,
    "ticketId" INTEGER,
    "status" "AiCallStatus" NOT NULL,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketDraft" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorMsgId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "placeholders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "factsUsed" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiCall_createdAt_idx" ON "AiCall"("createdAt");

-- CreateIndex
CREATE INDEX "AiCall_type_status_createdAt_idx" ON "AiCall"("type", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TicketDraft_ticketId_idx" ON "TicketDraft"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketDraft_ticketId_authorMsgId_key" ON "TicketDraft"("ticketId", "authorMsgId");

-- CreateIndex
CREATE INDEX "Ticket_aiStatus_aiNextAttemptAt_aiLeaseExpiresAt_idx" ON "Ticket"("aiStatus", "aiNextAttemptAt", "aiLeaseExpiresAt");

-- AddForeignKey
ALTER TABLE "TicketDraft" ADD CONSTRAINT "TicketDraft_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

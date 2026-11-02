-- CreateEnum
CREATE TYPE "TicketAuditField" AS ENUM ('CATEGORY', 'PRIORITY');

-- AlterEnum
ALTER TYPE "FieldSource" ADD VALUE 'AUTHOR';

-- CreateTable
CREATE TABLE "TicketFieldAudit" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "adminId" INTEGER NOT NULL,
    "field" "TicketAuditField" NOT NULL,
    "fromValue" TEXT NOT NULL,
    "toValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketFieldAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketFieldAudit_ticketId_createdAt_idx" ON "TicketFieldAudit"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "TicketFieldAudit" ADD CONSTRAINT "TicketFieldAudit_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketFieldAudit" ADD CONSTRAINT "TicketFieldAudit_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

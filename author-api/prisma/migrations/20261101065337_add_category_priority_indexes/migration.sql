-- CreateIndex
CREATE INDEX "Ticket_category_createdAt_idx" ON "Ticket"("category", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_priority_createdAt_idx" ON "Ticket"("priority", "createdAt");

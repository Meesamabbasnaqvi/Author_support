import test, { describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import {
  updateTicketCategory,
  updateTicketPriority,
  updateTicketStatus,
  applyAiClassification,
  ConcurrentModificationError,
} from "./tickets.js";
import { clampAiPriority, isRoyaltyOverdue } from "../lib/triage.js";

describe("Category, Priority, and Status Workflow Test Suite", () => {
  let authorId: number;
  let adminId: number;
  let bookId: number;
  let testTicketId: number;

  before(async () => {
    // Find or create test Author and Admin
    let author = await prisma.author.findFirst();
    if (!author) {
      author = await prisma.author.create({
        data: {
          authorId: "TEST_AUTH_1",
          name: "Test Author",
          email: "test.author@example.com",
        },
      });
    }
    authorId = author.id;

    let admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (!admin) {
      admin = await prisma.user.create({
        data: {
          email: "test.admin@example.com",
          passwordHash: "dummy",
          role: "ADMIN",
        },
      });
    }
    adminId = admin.id;

    let book = await prisma.book.findFirst({ where: { authorId } });
    if (!book) {
      book = await prisma.book.create({
        data: {
          bookId: "TEST_BK_1",
          title: "Test Book",
          status: "Published & Live",
          authorId,
          royaltyPending: 2500,
          lastRoyaltyPayoutDate: new Date("2024-01-01"),
        },
      });
    }
    bookId = book.id;
  });

  after(async () => {
    await prisma.$disconnect();
  });

  // Helper to create a fresh ticket
  async function createTestTicket(overrides: any = {}) {
    return await prisma.ticket.create({
      data: {
        subject: "Workflow Test Ticket",
        description: "Testing category, priority, and status workflows",
        authorId,
        bookId,
        category: "GENERAL_INQUIRY",
        categorySource: "AUTHOR",
        priority: "MEDIUM",
        prioritySource: "RULE",
        aiStatus: "PENDING",
        ...overrides,
      },
    });
  }

  // Test 1: Admin changes only category; AI runs; priority updates and aiPriority is stored.
  test("1. Admin changes only category; AI runs; priority updates and aiPriority is stored", async () => {
    const t = await createTestTicket();

    // Admin updates category to ISBN_METADATA
    await updateTicketCategory(t.id, adminId, {
      category: "ISBN_METADATA",
      expectedCategory: "GENERAL_INQUIRY",
    });

    const midTicket = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
    assert.equal(midTicket.category, "ISBN_METADATA");
    assert.equal(midTicket.categorySource, "ADMIN");
    assert.equal(midTicket.prioritySource, "RULE"); // unchanged by category edit

    // Now AI runs
    await applyAiClassification({
      ticketId: t.id,
      aiCategory: "PRINTING_QUALITY",
      rawPriority: "HIGH",
      aiReason: "AI classified as print defect",
    });

    const finalTicket = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
    // aiCategory and aiPriority are stored
    assert.equal(finalTicket.aiCategory, "PRINTING_QUALITY");
    assert.equal(finalTicket.aiPriority, "HIGH");
    assert.equal(finalTicket.aiStatus, "DONE");
    // Category was NOT overwritten because categorySource was ADMIN
    assert.equal(finalTicket.category, "ISBN_METADATA");
    assert.equal(finalTicket.categorySource, "ADMIN");
    // Priority WAS updated because prioritySource was not ADMIN
    assert.equal(finalTicket.priority, "HIGH");
    assert.equal(finalTicket.prioritySource, "AI");
  });

  // Test 2: Admin changes only priority; AI runs; category updates and aiCategory is stored.
  test("2. Admin changes only priority; AI runs; category updates and aiCategory is stored", async () => {
    const t = await createTestTicket();

    // Admin updates priority to CRITICAL
    await updateTicketPriority(t.id, adminId, {
      priority: "CRITICAL",
      expectedPriority: "MEDIUM",
    });

    const midTicket = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
    assert.equal(midTicket.priority, "CRITICAL");
    assert.equal(midTicket.prioritySource, "ADMIN");
    assert.equal(midTicket.categorySource, "AUTHOR"); // unchanged by priority edit

    // Now AI runs
    await applyAiClassification({
      ticketId: t.id,
      aiCategory: "DISTRIBUTION_AVAILABILITY",
      rawPriority: "LOW",
    });

    const finalTicket = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
    // aiCategory and aiPriority are stored
    assert.equal(finalTicket.aiCategory, "DISTRIBUTION_AVAILABILITY");
    assert.equal(finalTicket.aiPriority, "LOW");
    // Category WAS updated because categorySource was not ADMIN
    assert.equal(finalTicket.category, "DISTRIBUTION_AVAILABILITY");
    assert.equal(finalTicket.categorySource, "AI");
    // Priority was NOT overwritten because prioritySource was ADMIN
    assert.equal(finalTicket.priority, "CRITICAL");
    assert.equal(finalTicket.prioritySource, "ADMIN");
  });

  // Test 3: A failure partway through the AI transaction leaves nothing written, and a retry completes.
  test("3. A failure partway through the AI transaction leaves nothing written, and a retry completes", async () => {
    const t = await createTestTicket();

    // Attempt AI classification with simulated failure during transaction
    await assert.rejects(
      async () => {
        await applyAiClassification(
          {
            ticketId: t.id,
            aiCategory: "ROYALTY_PAYMENTS",
            rawPriority: "MEDIUM",
          },
          true // simulate failure
        );
      },
      /SIMULATED_TRANSACTION_FAILURE/
    );

    // Verify atomic rollback: nothing written
    const rolledBack = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
    assert.equal(rolledBack.aiCategory, null);
    assert.equal(rolledBack.aiPriority, null);
    assert.equal(rolledBack.aiStatus, "PENDING");
    assert.equal(rolledBack.category, "GENERAL_INQUIRY");
    assert.equal(rolledBack.priority, "MEDIUM");

    // Retry completes successfully
    await applyAiClassification({
      ticketId: t.id,
      aiCategory: "ROYALTY_PAYMENTS",
      rawPriority: "MEDIUM",
    });

    const completed = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
    assert.equal(completed.aiCategory, "ROYALTY_PAYMENTS");
    assert.equal(completed.aiPriority, "MEDIUM");
    assert.equal(completed.aiStatus, "DONE");
    assert.equal(completed.category, "ROYALTY_PAYMENTS");
  });

  // Test 4: Stale expectedCategory and expectedPriority return 409, even when the new value matches.
  test("4. Stale expectedCategory and expectedPriority return 409", async () => {
    const t = await createTestTicket({ category: "GENERAL_INQUIRY", priority: "MEDIUM" });

    // Category with stale expectedCategory
    await assert.rejects(
      async () => {
        await updateTicketCategory(t.id, adminId, {
          category: "PRINTING_QUALITY",
          expectedCategory: "ISBN_METADATA", // stale (actual is GENERAL_INQUIRY)
        });
      },
      (err: any) => err instanceof ConcurrentModificationError
    );

    // Priority with stale expectedPriority
    await assert.rejects(
      async () => {
        await updateTicketPriority(t.id, adminId, {
          priority: "HIGH",
          expectedPriority: "LOW", // stale (actual is MEDIUM)
        });
      },
      (err: any) => err instanceof ConcurrentModificationError
    );
  });

  // Test 5: A no-op sets the source to ADMIN and writes no log row.
  test("5. A no-op sets the source to ADMIN and writes no log row", async () => {
    const t = await createTestTicket({
      category: "GENERAL_INQUIRY",
      categorySource: "AUTHOR",
      priority: "MEDIUM",
      prioritySource: "RULE",
    });

    const initialAuditCount = await prisma.ticketFieldAudit.count({ where: { ticketId: t.id } });

    // Category no-op: set to GENERAL_INQUIRY
    const catResult = await updateTicketCategory(t.id, adminId, {
      category: "GENERAL_INQUIRY",
      expectedCategory: "GENERAL_INQUIRY",
    });
    assert.equal(catResult.noOp, true);

    // Priority no-op: set to MEDIUM
    const priResult = await updateTicketPriority(t.id, adminId, {
      priority: "MEDIUM",
      expectedPriority: "MEDIUM",
    });
    assert.equal(priResult.noOp, true);

    const fresh = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
    // Sources are updated to ADMIN
    assert.equal(fresh.categorySource, "ADMIN");
    assert.equal(fresh.prioritySource, "ADMIN");

    // No log rows written
    const finalAuditCount = await prisma.ticketFieldAudit.count({ where: { ticketId: t.id } });
    assert.equal(finalAuditCount, initialAuditCount);
  });

  // Test 6: useAiSuggestion returns 400 when aiPriority is null.
  test("6. useAiSuggestion returns 400 when aiPriority is null", async () => {
    const t = await createTestTicket({ aiPriority: null });

    await assert.rejects(
      async () => {
        await updateTicketPriority(t.id, adminId, {
          useAiSuggestion: true,
          expectedPriority: "MEDIUM",
        });
      },
      (err: any) => {
        return err.status === 400 && /does not have an AI priority suggestion/i.test(err.message);
      }
    );
  });

  // Test 7: Critical is only kept for an overdue royalty. Wrong ISBN is never below High.
  test("7. Critical is only kept for an overdue royalty. Wrong ISBN is never below High", () => {
    // 7a. Non-overdue royalty requested as CRITICAL is clamped to HIGH
    const clampedNotOverdue = clampAiPriority({
      category: "ROYALTY_PAYMENTS",
      rawPriority: "CRITICAL",
      isOverduePayout: false,
    });
    assert.equal(clampedNotOverdue, "HIGH");

    // 7b. Overdue royalty keeps CRITICAL
    const clampedOverdue = clampAiPriority({
      category: "ROYALTY_PAYMENTS",
      rawPriority: "CRITICAL",
      isOverduePayout: true,
    });
    assert.equal(clampedOverdue, "CRITICAL");

    // 7c. Wrong ISBN is never Critical (clamped to HIGH)
    const isbnCritical = clampAiPriority({
      category: "ISBN_METADATA",
      rawPriority: "CRITICAL",
      isWrongIsbn: true,
    });
    assert.equal(isbnCritical, "HIGH");

    // 7d. Wrong ISBN is raised to at least HIGH if raw was LOW or MEDIUM
    const isbnLow = clampAiPriority({
      category: "ISBN_METADATA",
      rawPriority: "LOW",
      isWrongIsbn: true,
    });
    assert.equal(isbnLow, "HIGH");

    const isbnMed = clampAiPriority({
      category: "ISBN_METADATA",
      rawPriority: "MEDIUM",
      isWrongIsbn: true,
    });
    assert.equal(isbnMed, "HIGH");
  });

  // Test 8: Status: closed returns 409, a disallowed transition is rejected, reopening needs a reason >= 10 chars, each change writes one log row.
  test("8. Status transitions: closed 409, disallowed rejected, reopening reason >= 10 chars, audits logged", async () => {
    const t = await createTestTicket({ status: "OPEN" });

    const initialAuditCount = await prisma.ticketStatusAudit.count({ where: { ticketId: t.id } });

    // Transition OPEN -> IN_PROGRESS: valid, writes 1 log row
    const step1 = await updateTicketStatus(t.id, adminId, {
      status: "IN_PROGRESS",
      expectedStatus: "OPEN",
    });
    assert.equal(step1.noOp, false);
    assert.equal(step1.ticket.status, "IN_PROGRESS");

    // Disallowed transition check: e.g. from CLOSED
    // Move to RESOLVED first
    await updateTicketStatus(t.id, adminId, { status: "RESOLVED", expectedStatus: "IN_PROGRESS" });

    // Reopen without >= 10 chars reason fails with 400
    await assert.rejects(
      async () => {
        await updateTicketStatus(t.id, adminId, {
          status: "OPEN",
          expectedStatus: "RESOLVED",
          reason: "short", // < 10 chars
        });
      },
      (err: any) => err.status === 400 && /at least 10 characters/i.test(err.message)
    );

    // Reopen with >= 10 chars reason succeeds
    const reopened = await updateTicketStatus(t.id, adminId, {
      status: "OPEN",
      expectedStatus: "RESOLVED",
      reason: "Reopening ticket because author sent proof",
    });
    assert.equal(reopened.ticket.status, "OPEN");

    // Move to CLOSED
    await updateTicketStatus(t.id, adminId, { status: "CLOSED", expectedStatus: "OPEN" });

    // Closed ticket cannot transition: returns 409 TICKET_CLOSED
    await assert.rejects(
      async () => {
        await updateTicketStatus(t.id, adminId, { status: "OPEN" });
      },
      (err: any) => err.status === 409 && err.code === "TICKET_CLOSED"
    );

    // Verify audit log count matches each successful state change
    const finalAuditCount = await prisma.ticketStatusAudit.count({ where: { ticketId: t.id } });
    assert.equal(finalAuditCount - initialAuditCount, 4); // OPEN->IN_PROGRESS, ->RESOLVED, ->OPEN, ->CLOSED
  });
});


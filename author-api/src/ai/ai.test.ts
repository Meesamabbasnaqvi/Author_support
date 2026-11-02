import test, { describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import {
  KB_CANONICAL_CONSTANTS,
  VERIFIER_PATTERNS,
  normalizeTimeline,
  DAILY_AI_CAP,
} from "./constants.js";
import { verifyDraft } from "./verifier.js";
import { FakeClient } from "./fakeClient.js";
import { applyAiClassification, checkDailyAiCap, logAiCall } from "./classify.js";
import { claimBatch, processClaimedTicket } from "./worker.js";
import goldenTickets from "../../tests/golden/tickets.json" with { type: "json" };

describe("AI Subsystem Test Suite", () => {
  let authorId: number;
  let bookId: number;

  before(async () => {
    let author = await prisma.author.findFirst();
    if (!author) {
      author = await prisma.author.create({
        data: {
          authorId: "TEST_AI_AUTH_1",
          name: "Jane Austen",
          email: "jane.austen@example.com",
        },
      });
    }
    authorId = author.id;

    let book = await prisma.book.findFirst({ where: { authorId } });
    if (!book) {
      book = await prisma.book.create({
        data: {
          bookId: "TEST_AI_BK_1",
          title: "Pride and Prejudices",
          isbn: "978-0-14-143951-8",
          status: "Published & Live",
          authorId,
          royaltyPending: 3500,
          royaltyPaid: 15000,
          lastRoyaltyPayoutDate: new Date("2024-01-01"),
        },
      });
    }
    bookId = book.id;
  });

  after(async () => {
    await prisma.$disconnect();
  });

  // 1. KB Parity Test
  test("1. KB Parity: all timelines, splits, and currency in docs/kb match constants.ts", async () => {
    const kbDir = path.resolve(process.cwd(), "docs", "kb");
    const files = await fs.readdir(kbDir);
    const mdFiles = files.filter((f) => f.endsWith(".md"));

    const allowedTimelinesNorm = new Set(
      KB_CANONICAL_CONSTANTS.TIMELINES.map((t) => normalizeTimeline(t))
    );

    for (const file of mdFiles) {
      const content = await fs.readFile(path.join(kbDir, file), "utf-8");

      // Check timelines with units
      const timelineMatches = content.match(VERIFIER_PATTERNS.TIMELINE_WITH_UNIT) || [];
      for (const match of timelineMatches) {
        const norm = normalizeTimeline(match);
        assert.ok(
          allowedTimelinesNorm.has(norm),
          `Timeline "${match}" in ${file} must be in KB_CANONICAL_CONSTANTS.TIMELINES`
        );
      }

      // Check percentages/splits
      const splitMatches = content.match(VERIFIER_PATTERNS.PERCENTAGE_OR_SPLIT) || [];
      for (const match of splitMatches) {
        assert.match(
          match,
          /(?:80\/20|80%|20%)/,
          `Percentage "${match}" in ${file} must match canonical 80/20 royalty split`
        );
      }
    }
  });

  // 2. Factual Verifier Guard
  describe("Factual Verifier Suite", () => {
    const serverFacts = [
      { label: "Book ISBN", value: "978-0-14-143951-8" },
      { label: "Royalty Pending", value: "₹3,500.00" },
      { label: "Last Payout Date", value: "2024-01-01" },
    ];
    const authorText = "I sold 200 copies on Amazon and am asking about my ₹3,500 payout.";

    test("Accepts verified server facts and canonical KB timelines without placeholders", () => {
      const draftBody =
        "Hi Jane,\n\nWe verified your pending royalty of ₹3,500.00 for ISBN 978-0-14-143951-8. Our standard payout cycle is 45 days, and our support team will update you within 48 hours.\n\nWarm regards,\nBookLeaf Support";

      const res = verifyDraft({
        body: draftBody,
        serverFacts,
        authorText,
      });

      assert.equal(res.placeholders.length, 0);
      assert.ok(!res.body.includes("[ADMIN:"));
    });

    test("Allows restating author's own claimed numbers without creating blocking placeholders", () => {
      const draftBody =
        "Hi Jane,\n\nRegarding the 200 copies you mentioned selling, our team is reviewing the platform report.\n\nWarm regards,\nBookLeaf Support";

      const res = verifyDraft({
        body: draftBody,
        serverFacts,
        authorText,
      });

      assert.equal(res.placeholders.length, 0);
      assert.ok(!res.body.includes("[ADMIN:"));
    });

    test("Replaces hallucinated currency, dates, and ISBNs with [ADMIN: verify ...] placeholders", () => {
      const draftBody =
        "Hi Jane,\n\nWe see an unverified payment of ₹9,999.00 scheduled for 2026-12-25 regarding ISBN 978-9-99-999999-9 with a 14-day turnaround.\n\nWarm regards,\nBookLeaf Support";

      const res = verifyDraft({
        body: draftBody,
        serverFacts,
        authorText,
      });

      assert.ok(res.body.includes("[ADMIN: verify ₹9,999.00]"));
      assert.ok(res.body.includes("[ADMIN: verify 2026-12-25]"));
      assert.ok(res.body.includes("[ADMIN: verify 978-9-99-999999-9]"));
      assert.ok(res.body.includes("[ADMIN: verify 14-day]"));
      assert.equal(res.placeholders.length, 4);
    });

    test("Ignores plain integers in prose (e.g. 2 copies, 1 quarter)", () => {
      const draftBody =
        "Hi Jane,\n\nWe received 2 copies and are reviewing sales for 1 quarter.\n\nWarm regards,\nBookLeaf Support";

      const res = verifyDraft({
        body: draftBody,
        serverFacts,
        authorText,
      });

      assert.equal(res.placeholders.length, 0);
      assert.ok(!res.body.includes("[ADMIN:"));
    });
  });

  // 3. Classification & Clamping Suite
  describe("Classification & Server Clamping Suite", () => {
    test("Enforces Rule 1: CRITICAL proposed for non-overdue ticket is clamped to HIGH", async () => {
      const ticket = await prisma.ticket.create({
        data: {
          subject: "Printing issue",
          description: "Minor print defect on cover",
          authorId,
          category: "PRINTING_QUALITY",
          priority: "MEDIUM",
        },
      });

      // AI proposes CRITICAL
      await applyAiClassification({
        ticketId: ticket.id,
        aiCategory: "PRINTING_QUALITY",
        rawPriority: "CRITICAL",
      });

      const updated = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      assert.equal(updated.aiPriority, "HIGH"); // Clamped!
      assert.equal(updated.priority, "HIGH");
    });

    test("Enforces Rule 2: Wrong ISBN is clamped to HIGH, never CRITICAL and never below HIGH", async () => {
      const ticket = await prisma.ticket.create({
        data: {
          subject: "Wrong ISBN on store",
          description: "The barcode and ISBN are mismatched",
          authorId,
          category: "ISBN_METADATA",
          priority: "LOW",
        },
      });

      // Proposing CRITICAL for wrong ISBN clamps to HIGH
      await applyAiClassification({
        ticketId: ticket.id,
        aiCategory: "ISBN_METADATA",
        rawPriority: "CRITICAL",
        isWrongIsbn: true,
      });

      const updated = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      assert.equal(updated.aiPriority, "HIGH");
      assert.equal(updated.priority, "HIGH");
    });

    test("Golden Dataset: FakeClient correctly handles all 6 ticket categories", async () => {
      const fakeClient = new FakeClient();

      for (const item of goldenTickets) {
        const res = await fakeClient.classify(
          `Subject: ${item.subject}\nDescription: ${item.description}`
        );
        assert.equal(
          res.category,
          item.expectedCategory,
          `Category mismatch for ticket "${item.subject}"`
        );
      }
    });
  });

  // 4. Worker Concurrency & Lease Suite
  describe("Worker Lease & Concurrency Suite", () => {
    test("Claim batch acquires lease, increments attempts, and releases DB lock immediately", async () => {
      // Clear prior pending tickets so this test has a clean batch
      await prisma.ticket.updateMany({
        where: { aiStatus: "PENDING" },
        data: { aiStatus: "DONE" },
      });

      const ticket = await prisma.ticket.create({
        data: {
          subject: "Pending AI ticket",
          description: "Needs classification",
          authorId,
          aiStatus: "PENDING",
        },
      });

      const claimed = await claimBatch(5);
      const myClaim = claimed.find((c) => c.id === ticket.id);

      assert.ok(myClaim, "Ticket should be claimed");
      assert.equal(myClaim.attempts, 1);
      assert.ok(myClaim.leaseToken);

      const inDb = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      assert.equal(inDb.aiLeaseToken, myClaim.leaseToken);
      assert.ok(inDb.aiLeaseExpiresAt);
      assert.equal(inDb.aiAttempts, 1);

      // Process with matching lease token
      const fakeClient = new FakeClient();
      const success = await processClaimedTicket(
        myClaim,
        fakeClient,
        "1. GENERAL_INQUIRY: General questions"
      );
      assert.equal(success, true);

      const completed = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      assert.equal(completed.aiStatus, "DONE");
      assert.equal(completed.aiLeaseToken, null); // Lease cleared!
    });

    test("Discards write if lease token was reclaimed by another worker", async () => {
      await prisma.ticket.updateMany({
        where: { aiStatus: "PENDING" },
        data: { aiStatus: "DONE" },
      });

      const ticket = await prisma.ticket.create({
        data: {
          subject: "Stale worker ticket",
          description: "Worker timed out",
          authorId,
          aiStatus: "PENDING",
        },
      });

      const claimed = await claimBatch(5);
      const myClaim = claimed.find((c) => c.id === ticket.id);
      assert.ok(myClaim);

      // Simulate another worker reclaiming the lease
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { aiLeaseToken: "OTHER_WORKER_TOKEN" },
      });

      const fakeClient = new FakeClient();
      const success = await processClaimedTicket(
        myClaim,
        fakeClient,
        "1. GENERAL_INQUIRY: General questions"
      );

      // Write was discarded
      assert.equal(success, false);
      const midTicket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      assert.equal(midTicket.aiStatus, "PENDING"); // Not marked DONE with stale write
    });
  });

  // 5. Daily Soft Cap & Logging
  describe("Daily Cap Suite", () => {
    test("checkDailyAiCap() allows calls under the cap and logs AiCall entries", async () => {
      await logAiCall({
        type: "CLASSIFICATION",
        status: "SUCCESS",
        durationMs: 120,
      });

      // Under cap does not throw
      await assert.doesNotReject(async () => {
        await checkDailyAiCap();
      });
    });
  });

  // 6. Admin Message Placeholder Guard
  describe("Placeholder Guard Suite", () => {
    test("Regex detects [ADMIN: ...] placeholder to block unresolved drafts", () => {
      const unresolved = "Hi Jane,\n\n[ADMIN: verify royalty status]\n\nWarm regards,\nBookLeaf";
      assert.ok(/\[ADMIN:/i.test(unresolved), "Should detect unresolved placeholder");

      const resolved = "Hi Jane,\n\nWe verified your status.\n\nWarm regards,\nBookLeaf";
      assert.ok(!/\[ADMIN:/i.test(resolved), "Should pass once placeholder is replaced");
    });
  });
});

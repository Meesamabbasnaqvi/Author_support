import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classificationSchema } from "./llm.js";
import { prisma } from "../lib/prisma.js";
import { DAILY_AI_CAP } from "./constants.js";
import {
    pollAndProcessPending,
    claimBatch,
    isQuotaOrRateLimitError,
    isWorkerPaused,
    pauseWorker,
    resetWorkerPause,
    processClaimedTicket,
} from "./worker.js";

const valid = {
    category: "ROYALTY_PAYMENTS",
    priority: "HIGH",
    isWrongIsbn: false,
    confidence: 0.9,
    reason: "Question about a payout.",
};

describe("Classification output is never defaulted", () => {
    test("accepts a complete, valid classification", () => {
        assert.equal(classificationSchema.safeParse(valid).success, true);
    });

    test("rejects an unknown category", () => {
        assert.equal(classificationSchema.safeParse({ ...valid, category: "BILLING" }).success, false);
    });

    test("rejects an unknown priority", () => {
        assert.equal(classificationSchema.safeParse({ ...valid, priority: "URGENT" }).success, false);
    });

    test("rejects a missing isWrongIsbn", () => {
        const { isWrongIsbn: _omit, ...rest } = valid;
        assert.equal(classificationSchema.safeParse(rest).success, false);
    });

    test("rejects confidence outside 0 to 1", () => {
        assert.equal(classificationSchema.safeParse({ ...valid, confidence: 1.5 }).success, false);
    });
});

describe("Claim behaviour", () => {
    test("claimBatch returns an array when nothing is pending", async () => {
        const claimed = await claimBatch(1);
        assert.ok(Array.isArray(claimed));
    });
});
test("a capped poll claims nothing and leaves attempts unchanged", async () => {
    const author = await prisma.author.findFirst();
    if (!author) throw new Error("No author in the test database. Run the seed first.");

    const ticket = await prisma.ticket.create({
        data: {
            subject: "Cap test",
            description: "Cap test ticket",
            authorId: author.id,
            aiStatus: "PENDING",
        },
    });

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    await prisma.aiCall.createMany({
        data: Array.from({ length: DAILY_AI_CAP }, () => ({
            type: "CLASSIFICATION" as const,
            status: "SUCCESS" as const,
        })),
    });

    try {
        const processed = await pollAndProcessPending(5);
        assert.equal(processed, 0);

        const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
        assert.equal(after.aiAttempts, 0);
        assert.equal(after.aiStatus, "PENDING");
    } finally {
        await prisma.aiCall.deleteMany({
            where: { createdAt: { gte: startOfDay }, type: "CLASSIFICATION", status: "SUCCESS" },
        });
        await prisma.ticket.delete({ where: { id: ticket.id } });
    }
});

describe("429 / Quota Error Circuit Breaker", () => {
    test("isQuotaOrRateLimitError detects 429 status and rate limit keywords", () => {
        assert.equal(isQuotaOrRateLimitError({ status: 429 }), true);
        assert.equal(isQuotaOrRateLimitError(new Error("Gemini API HTTP 429 (Too Many Requests)")), true);
        assert.equal(isQuotaOrRateLimitError(new Error("RESOURCE_EXHAUSTED")), true);
        assert.equal(isQuotaOrRateLimitError(new Error("quota exceeded for quota metric")), true);
        assert.equal(isQuotaOrRateLimitError(new Error("Database connection timeout")), false);
        assert.equal(isQuotaOrRateLimitError(null), false);
    });

    test("a 429 pauses the worker, refunds the attempt, and reschedules without failing", async () => {
        resetWorkerPause();

        const author = await prisma.author.findFirstOrThrow();
        const ticket = await prisma.ticket.create({
            data: {
                subject: "Quota 429 Test",
                description: "Testing worker backoff on 429",
                authorId: author.id,
                aiStatus: "PENDING",
            },
        });

        const leaseToken = "test-429-lease-token";
        await prisma.ticket.update({
            where: { id: ticket.id },
            data: {
                aiLeaseToken: leaseToken,
                aiLeaseExpiresAt: new Date(Date.now() + 120_000),
                aiAttempts: 1,
            },
        });

        const thisClaimed = {
            id: ticket.id,
            subject: ticket.subject,
            description: ticket.description,
            bookTitle: null,
            bookStatus: null,
            leaseToken,
            attempts: 1,
        };

        const fake429Client = {
            async classify(): Promise<any> {
                throw new Error("Gemini API HTTP 429 (Too Many Requests): Quota exceeded");
            },
            async draft(): Promise<any> {
                throw new Error("Gemini API HTTP 429");
            },
        };

        try {
            const success = await processClaimedTicket(thisClaimed, fake429Client, "routing summary");
            assert.equal(success, false);

            // 1. Worker must be paused
            assert.equal(isWorkerPaused(), true);

            // 2. Ticket attempts must be refunded back to 0
            const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
            assert.equal(after.aiAttempts, 0);
            assert.equal(after.aiStatus, "PENDING");
            assert.ok(after.aiNextAttemptAt !== null);

            // 3. Worker polling must immediately return 0 while paused
            const pollCount = await pollAndProcessPending(5);
            assert.equal(pollCount, 0);
        } finally {
            resetWorkerPause();
            await prisma.aiCall.deleteMany({ where: { ticketId: ticket.id } });
            await prisma.ticket.delete({ where: { id: ticket.id } });
        }
    });
});
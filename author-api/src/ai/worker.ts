import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import type { LlmClient } from "./llm.js";
import { getGeminiClient } from "./geminiClient.js";
import { FakeClient } from "./fakeClient.js";
import { getRoutingSummary } from "./kb.js";
import { buildClassificationPrompt } from "./prompts.js";
import { applyAiClassification, logAiCall } from "./classify.js";
import { DAILY_AI_CAP } from "./constants.js";

const LEASE_DURATION_MS = 2 * 60 * 1000; // 2 minutes
const MODEL_TIMEOUT_MS = 20 * 1000; // 20 seconds
const MAX_TOTAL_ATTEMPTS = 4; // 1 initial try + 3 retries

/** Retry delay after a failed attempt: 30s, 2min, 10min. */
function getRetryDelayMs(attemptNumber: number): number {
  if (attemptNumber === 1) return 30 * 1000;
  if (attemptNumber === 2) return 2 * 60 * 1000;
  return 10 * 60 * 1000;
}

export interface ClaimedTicket {
  id: number;
  subject: string;
  description: string;
  bookTitle: string | null;
  bookStatus: string | null;
  leaseToken: string;
  attempts: number;
}

let workerPausedUntil = 0;

/**
 * Check if an error was caused by a 429 Too Many Requests or quota exhaustion.
 */
export function isQuotaOrRateLimitError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number })?.status;
  return (
    status === 429 ||
    /429|resource_exhausted|rate limit|quota exceeded|too many requests/i.test(msg)
  );
}

/**
 * Pauses the worker from processing or polling tickets for a given duration (default: 60s).
 */
export function pauseWorker(durationMs = 60 * 1000): void {
  workerPausedUntil = Math.max(workerPausedUntil, Date.now() + durationMs);
}

export function isWorkerPaused(): boolean {
  return Date.now() < workerPausedUntil;
}

export function getWorkerPausedUntil(): number {
  return workerPausedUntil;
}

export function resetWorkerPause(): void {
  workerPausedUntil = 0;
}

/**
 * True when today's model calls have reached the cap.
 * Never throws and never writes, so polling can check it cheaply.
 */
export async function isDailyCapReached(): Promise<boolean> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const count = await prisma.aiCall.count({
    where: {
      createdAt: { gte: startOfDay },
      status: { not: "CAP_EXCEEDED" },
    },
  });

  return count >= DAILY_AI_CAP;
}

/**
 * Step 1: claim pending tickets in a short transaction (FOR UPDATE SKIP LOCKED).
 * Commits immediately, so no database connection is held during the model call.
 */
export async function claimBatch(batchSize = 5): Promise<ClaimedTicket[]> {
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(Date.now() + LEASE_DURATION_MS);

  return await prisma.$transaction(
    async (tx) => {
      const candidates = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id
        FROM "Ticket"
        WHERE "aiStatus" = 'PENDING'
          AND ("aiNextAttemptAt" IS NULL OR "aiNextAttemptAt" <= NOW())
          AND ("aiLeaseExpiresAt" IS NULL OR "aiLeaseExpiresAt" <= NOW())
        ORDER BY "createdAt" ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      `;

      if (candidates.length === 0) {
        return [];
      }

      const ids = candidates.map((c) => c.id);

      await tx.ticket.updateMany({
        where: { id: { in: ids } },
        data: {
          aiLeaseToken: leaseToken,
          aiLeaseExpiresAt: leaseExpiresAt,
          aiAttempts: { increment: 1 },
        },
      });

      const claimed = await tx.ticket.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          subject: true,
          description: true,
          aiAttempts: true,
          book: { select: { title: true, status: true } },
        },
      });

      return claimed.map((t) => ({
        id: t.id,
        subject: t.subject,
        description: t.description,
        bookTitle: t.book?.title ?? null,
        bookStatus: t.book?.status ?? null,
        leaseToken,
        attempts: t.aiAttempts,
      }));
    },
    { maxWait: 10000, timeout: 20000 }
  );
}

/**
 * Steps 2 and 3: call the model outside any transaction, then write in one transaction.
 * Returns true only when the result was written.
 */
export async function processClaimedTicket(
  ticket: ClaimedTicket,
  client: LlmClient,
  routingSummary: string
): Promise<boolean> {
  const startTime = Date.now();

  // The cap was reached after this ticket was claimed. Give the attempt back, so the cap never
  // pushes a ticket towards FAILED.
  if (await isDailyCapReached()) {
    await prisma.ticket.updateMany({
      where: { id: ticket.id, aiLeaseToken: ticket.leaseToken },
      data: {
        aiLeaseToken: null,
        aiLeaseExpiresAt: null,
        aiAttempts: { decrement: 1 },
      },
    });
    return false;
  }

  try {
    const prompt = buildClassificationPrompt({
      routingSummary,
      subject: ticket.subject,
      description: ticket.description,
      bookTitle: ticket.bookTitle,
      bookStatus: ticket.bookStatus,
    });

    const signal = AbortSignal.timeout(MODEL_TIMEOUT_MS);
    const result = await client.classify(prompt, { signal });

    // One transaction: lock the row, check the lease, write the results, clear the lease.
    const written = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM "Ticket"
        WHERE id = ${ticket.id} AND "aiLeaseToken" = ${ticket.leaseToken}
        FOR UPDATE
      `;

      if (locked.length === 0) {
        // Another worker reclaimed this ticket after our lease expired. Discard our result.
        return false;
      }

      await applyAiClassification(
        {
          ticketId: ticket.id,
          aiCategory: result.category,
          rawPriority: result.priority,
          aiConfidence: result.confidence,
          aiReason: result.reason,
          isWrongIsbn: result.isWrongIsbn,
        },
        false,
        tx
      );

      await tx.ticket.update({
        where: { id: ticket.id },
        data: { aiLeaseToken: null, aiLeaseExpiresAt: null },
      });

      return true;
    });

    if (written) {
      await logAiCall({
        type: "CLASSIFICATION",
        status: "SUCCESS",
        ticketId: ticket.id,
        durationMs: Date.now() - startTime,
      });
    }

    return written;
  } catch (error) {
    console.error(`Failed to classify ticket #${ticket.id}:`, error);

    // If upstream returned 429 / quota exceeded, pause the worker and refund the attempt.
    if (isQuotaOrRateLimitError(error)) {
      pauseWorker(60 * 1000);
      const resumeAt = new Date(Date.now() + 60 * 1000);

      await prisma.ticket.updateMany({
        where: { id: ticket.id, aiLeaseToken: ticket.leaseToken },
        data: {
          aiLeaseToken: null,
          aiLeaseExpiresAt: null,
          aiAttempts: { decrement: 1 }, // Refund the attempt
          aiNextAttemptAt: resumeAt,
        },
      });

      await logAiCall({
        type: "CLASSIFICATION",
        status: "CAP_EXCEEDED",
        ticketId: ticket.id,
        durationMs: Date.now() - startTime,
      });

      return false;
    }

    // Failure: clear the lease, then either schedule a retry or mark FAILED.
    const isExhausted = ticket.attempts >= MAX_TOTAL_ATTEMPTS;
    const nextAttemptAt = new Date(Date.now() + getRetryDelayMs(ticket.attempts));

    await prisma.ticket.updateMany({
      where: { id: ticket.id, aiLeaseToken: ticket.leaseToken },
      data: {
        aiLeaseToken: null,
        aiLeaseExpiresAt: null,
        ...(isExhausted ? { aiStatus: "FAILED" } : { aiNextAttemptAt: nextAttemptAt }),
      },
    });

    await logAiCall({
      type: "CLASSIFICATION",
      status: "FAILED",
      ticketId: ticket.id,
      durationMs: Date.now() - startTime,
    });

    return false;
  }
}

/**
 * One polling pass. Checks pause state and cap before claiming, so a paused or capped system claims nothing.
 */
export async function pollAndProcessPending(
  batchSize = 5,
  client: LlmClient = process.env.USE_FAKE_AI === "true" || process.env.GEMINI_API_KEY === "mock"
    ? new FakeClient()
    : getGeminiClient()
): Promise<number> {
  if (isWorkerPaused()) return 0;
  if (await isDailyCapReached()) return 0;

  const claimed = await claimBatch(batchSize);
  if (claimed.length === 0) return 0;

  const routingSummary = await getRoutingSummary();

  let processedCount = 0;
  for (const ticket of claimed) {
    const success = await processClaimedTicket(ticket, client, routingSummary);
    if (success) processedCount++;
  }

  return processedCount;
}

/**
 * Starts a recurring background worker. Returns a stop function.
 */
export function startWorker(
  intervalMs = 5000,
  client: LlmClient = process.env.USE_FAKE_AI === "true" || process.env.GEMINI_API_KEY === "mock"
    ? new FakeClient()
    : getGeminiClient()
): () => void {
  let isRunning = true;
  let isProcessing = false;

  const intervalId = setInterval(async () => {
    if (!isRunning || isProcessing) return;

    isProcessing = true;
    try {
      await pollAndProcessPending(5, client);
    } catch (err) {
      console.error("Worker error during polling pass:", err);
    } finally {
      isProcessing = false;
    }
  }, intervalMs);

  return () => {
    isRunning = false;
    clearInterval(intervalId);
  };
}
import { prisma } from "../lib/prisma.js";
import { clampAiPriority, isRoyaltyOverdue } from "../lib/triage.js";
import type { TicketCategory, TicketPriority, LlmClient } from "./llm.js";
import { getRoutingSummary } from "./kb.js";
import { buildClassificationPrompt } from "./prompts.js";
import { getGeminiClient } from "./geminiClient.js";
import { FakeClient } from "./fakeClient.js";
import { DAILY_AI_CAP } from "./constants.js";
import type { AiCallType, AiCallStatus, Prisma } from "../../generated/prisma/client.js";

/**
 * Throws if today's AI calls have reached the cap. Records a CAP_EXCEEDED row first.
 * Soft limit under concurrency: a small overshoot is possible when calls race.
 */
export async function checkDailyAiCap(): Promise<void> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const callCount = await prisma.aiCall.count({
    where: {
      createdAt: { gte: startOfDay },
      status: { not: "CAP_EXCEEDED" },
    },
  });

  if (callCount >= DAILY_AI_CAP) {
    await prisma.aiCall.create({
      data: { type: "CLASSIFICATION", status: "CAP_EXCEEDED" },
    });
    throw new Error(`Daily AI cap reached (${callCount}/${DAILY_AI_CAP} calls). AI operations suspended until tomorrow.`);
  }
}

/**
 * Logs an AI call event. Stores counts and metadata only (no message bodies or PII).
 */
export async function logAiCall(params: {
  type: AiCallType;
  status: AiCallStatus;
  ticketId?: number;
  durationMs?: number;
}): Promise<void> {
  try {
    await prisma.aiCall.create({
      data: {
        type: params.type,
        status: params.status,
        ...(params.ticketId !== undefined ? { ticketId: params.ticketId } : {}),
        ...(params.durationMs !== undefined ? { durationMs: params.durationMs } : {}),
      },
    });
  } catch (err) {
    console.error("Failed to log AiCall entry:", err);
  }
}

export interface ApplyClassificationParams {
  ticketId: number;
  aiCategory: TicketCategory;
  rawPriority: TicketPriority;
  aiConfidence?: number;
  aiReason?: string;
  isWrongIsbn?: boolean;
}

/**
 * The three writes, run inside the transaction given to it.
 * Step 1: AI record, written once (only while aiCategory and aiPriority are null).
 * Step 2: active category, only if the admin has not set it.
 * Step 3: active priority, only if the admin has not set it, after the server clamp.
 */
async function writeClassification(
  tx: Prisma.TransactionClient,
  params: ApplyClassificationParams,
  simulateFailureBetweenWrites: boolean
): Promise<void> {
  const isWrongIsbn = params.isWrongIsbn === true;

  const ticket = await tx.ticket.findUnique({
    where: { id: params.ticketId },
    select: { book: { select: { royaltyPending: true, lastRoyaltyPayoutDate: true } } },
  });
  const isOverduePayout = isRoyaltyOverdue(ticket?.book);

  const clampedPriority = clampAiPriority({
    category: params.aiCategory,
    rawPriority: params.rawPriority,
    isWrongIsbn,
    isOverduePayout,
  });

  await tx.ticket.updateMany({
    where: { id: params.ticketId, aiCategory: null, aiPriority: null },
    data: {
      aiCategory: params.aiCategory,
      aiPriority: clampedPriority,
      aiStatus: "DONE",
      ...(params.aiConfidence !== undefined ? { aiConfidence: params.aiConfidence } : {}),
      ...(params.aiReason !== undefined ? { aiReason: params.aiReason } : {}),
    },
  });

  if (simulateFailureBetweenWrites) {
    throw new Error("SIMULATED_TRANSACTION_FAILURE");
  }

  await tx.ticket.updateMany({
    where: { id: params.ticketId, categorySource: { not: "ADMIN" } },
    data: { category: params.aiCategory, categorySource: "AI" },
  });

  await tx.ticket.updateMany({
    where: { id: params.ticketId, prioritySource: { not: "ADMIN" } },
    data: {
      priority: clampedPriority,
      prioritySource: "AI",
      priorityReason: params.aiReason ?? "Classified by AI triage",
    },
  });
}

/**
 * Applies a classification.
 * If the caller passes its own transaction (the worker does), the writes join it, so the lease check
 * and the writes commit or roll back together. Otherwise this opens its own transaction.
 */
export async function applyAiClassification(
  params: ApplyClassificationParams,
  simulateFailureBetweenWrites = false,
  existingTx?: Prisma.TransactionClient
): Promise<void> {
  if (existingTx) {
    return writeClassification(existingTx, params, simulateFailureBetweenWrites);
  }
  return prisma.$transaction((tx) => writeClassification(tx, params, simulateFailureBetweenWrites));
}

/**
 * Classifies one ticket by calling the model, then applying the result in its own transaction.
 */
export async function classifyTicket(
  ticketId: number,
  client: LlmClient = process.env.USE_FAKE_AI === "true" || process.env.GEMINI_API_KEY === "mock"
    ? new FakeClient()
    : getGeminiClient(),
  options?: { signal?: AbortSignal }
): Promise<void> {
  const startTime = Date.now();

  try {
    await checkDailyAiCap();

    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: {
        book: { select: { title: true, status: true } },
      },
    });

    const routingSummary = await getRoutingSummary();
    const prompt = buildClassificationPrompt({
      routingSummary,
      subject: ticket.subject,
      description: ticket.description,
      bookTitle: ticket.book?.title ?? null,
      bookStatus: ticket.book?.status ?? null,
    });

    const result = await client.classify(prompt, options);

    await applyAiClassification({
      ticketId,
      aiCategory: result.category,
      rawPriority: result.priority,
      aiConfidence: result.confidence,
      aiReason: result.reason,
      isWrongIsbn: result.isWrongIsbn,
    });

    await logAiCall({
      type: "CLASSIFICATION",
      status: "SUCCESS",
      ticketId,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    await logAiCall({
      type: "CLASSIFICATION",
      status: "FAILED",
      ticketId,
      durationMs: Date.now() - startTime,
    });
    throw error;
  }
}
import {
  listTicketsQuerySchema,
  buildTicketWhere,
  ticketListInclude,
} from "../lib/ticketList.js";
import { ticketReadLimiter } from "../middleware/rateLimits.js";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  requireAuth,
  requireAdmin,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { suggestPriority, clampAiPriority, isRoyaltyOverdue, getRoyaltyOverdueDays } from "../lib/triage.js";
import { applyAiClassification, checkDailyAiCap, logAiCall } from "../ai/classify.js";
import { getCategoryKb } from "../ai/kb.js";
import { buildDraftPrompt } from "../ai/prompts.js";
import { buildDraftFacts, formatFactsForPrompt } from "../ai/draftFacts.js";
import { verifyDraft } from "../ai/verifier.js";
import { isQuotaOrRateLimitError } from "../ai/worker.js";
import { getGeminiClient } from "../ai/geminiClient.js";
import { FakeClient } from "../ai/fakeClient.js";

export { applyAiClassification };

export class ConcurrentModificationError extends Error {
  constructor(message = "This ticket was modified by another staff member. Please refresh to see the latest changes.") {
    super(message);
    this.name = "ConcurrentModificationError";
  }
}
import { isTicketOverdue } from "../lib/policy.js";
import { uploadMiddleware } from "../middleware/upload.js";
import { storage } from "../lib/storage.js";
import rateLimit from "express-rate-limit";

const ticketCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many tickets created. Please wait before creating another ticket." },
});

const ticketReplyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many messages sent. Please slow down." },
});

const router = Router();

const createTicketSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(5000),
  category: z
    .enum([
      "ROYALTY_PAYMENTS",
      "ISBN_METADATA",
      "PRINTING_QUALITY",
      "DISTRIBUTION_AVAILABILITY",
      "BOOK_STATUS_PRODUCTION",
      "GENERAL_INQUIRY",
    ])
    .optional(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  bookId: z.preprocess((val) => (val === "" || val === undefined || val === null ? undefined : Number(val)), z.number().int().positive().optional()),
});

// Create a support ticket (authors only).
router.post(
  "/",
  requireAuth,
  ticketCreationLimiter,
  (req, res, next) => {
    uploadMiddleware.single("file")(req, res, (err: any) => {
      if (err) {
        return res.status(400).json({ error: err.message || "File upload failed" });
      }
      next();
    });
  },
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (authReq.user.role !== "AUTHOR") {
      return res.status(403).json({
        error: "Only authors can create support tickets",
      });
    }

    const parsed = createTicketSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid ticket details",
        details: parsed.error.flatten(),
      });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: authReq.user.id },
        select: { authorId: true },
      });

      if (!user?.authorId) {
        return res.status(403).json({
          error: "Your account is not linked to an author profile",
        });
      }

      let bookStatus: string | null = null;
      let isOverduePayout = false;

      if (parsed.data.bookId !== undefined) {
        const book = await prisma.book.findFirst({
          where: {
            id: parsed.data.bookId,
            authorId: user.authorId,
          },
          select: {
            id: true,
            status: true,
            royaltyPending: true,
            lastRoyaltyPayoutDate: true,
          },
        });

        if (!book) {
          return res.status(400).json({
            error: "The selected book was not found for your author profile",
          });
        }

        bookStatus = book.status;
        isOverduePayout = isRoyaltyOverdue(book);
      }

      const category = parsed.data.category ?? "GENERAL_INQUIRY";
      const categorySource = parsed.data.category ? "AUTHOR" : "DEFAULT";

      const isWrongIsbn = category === "ISBN_METADATA";
      const isBookUnavailable = category === "DISTRIBUTION_AVAILABILITY";
      const isProductionDelay = (bookStatus?.toLowerCase() === "in production" || category === "BOOK_STATUS_PRODUCTION");

      // Call triage rule engine
      const triage = suggestPriority({
        category,
        bookStatus,
        isWrongIsbn,
        isBookUnavailable,
        isOverduePayout,
        isProductionDelay,
      });

      const ticket = await prisma.ticket.create({
        data: {
          subject: parsed.data.subject,
          description: parsed.data.description,
          authorId: user.authorId,
          authorLastReadAt: new Date(), // Author created it
          category,
          categorySource,
          priority: triage.priority,
          prioritySource: "RULE",
          priorityReason: triage.reason,
          ...(parsed.data.bookId !== undefined && {
            bookId: parsed.data.bookId,
          }),
          messages: {
            create: {
              content: parsed.data.description,
              senderId: authReq.user.id,
              isAdmin: false,
            },
          },
        },
        include: {
          messages: true,
        },
      });

      if (req.file) {
        const stored = await storage.save(req.file);
        await prisma.attachment.create({
          data: {
            filename: stored.filename,
            url: stored.url,
            mimeType: stored.mimeType,
            size: stored.size,
            ticketId: ticket.id,
            ...(ticket.messages[0]?.id ? { messageId: ticket.messages[0].id } : {}),
          },
        });
      }

      return res.status(201).json({
        message: "Support ticket created successfully",
        ticket,
      });
    } catch (error) {
      console.error("Failed to create ticket:", error);
      return res.status(500).json({
        error: "Failed to create support ticket",
      });
    }
  });

// List tickets: authors see their own; admins see all.
// List tickets: authors see their own; admins see all. Filters run in the database.
router.get("/", requireAuth, ticketReadLimiter, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const parsed = listTicketsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid filter parameters",
      details: parsed.error.flatten(),
    });
  }

  try {
    let authorId: number | undefined;

    if (authReq.user.role === "AUTHOR") {
      const user = await prisma.user.findUnique({
        where: { id: authReq.user.id },
        select: { authorId: true },
      });

      if (!user?.authorId) {
        return res.status(403).json({
          error: "Your account is not linked to an author profile",
        });
      }

      authorId = user.authorId;
    }

    const tickets = await prisma.ticket.findMany({
      where: buildTicketWhere(parsed.data, { authorId }),
      include: ticketListInclude,
      orderBy: { updatedAt: "desc" },
    });

    return res.json({
      tickets: tickets.map((t) => ({
        ...t,
        overdue: isTicketOverdue(t.createdAt, t.priority),
        royaltyOverdueDays: getRoyaltyOverdueDays(t.book),
        messageCount: t._count.messages,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch tickets:", error);
    return res.status(500).json({ error: "Failed to fetch tickets" });
  }
});
const createMessageSchema = z.object({
  content: z.string().trim().min(1).max(5000),
});
// When an author opens their ticket, their authorLastReadAt is updated to now().
router.get("/:id", requireAuth, ticketReadLimiter, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) return res.status(401).json({ error: "Authentication required" });
  const ticketId = Number(req.params.id);
  if (!Number.isSafeInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({ error: "Invalid ticket ID" });
  }
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        author: { select: { id: true, name: true, email: true, authorId: true } },
        book: { select: { id: true, title: true, royaltyPending: true, lastRoyaltyPayoutDate: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            sender: {
              select: { email: true, author: { select: { name: true } } },
            },
            attachments: {
              select: {
                id: true,
                filename: true,
                url: true,
                mimeType: true,
                size: true,
                createdAt: true,
              },
            },
          },
        },
        assignedAdmin: { select: { email: true } },
        ...(authReq.user.role === "ADMIN" && {
          statusAudits: {
            orderBy: { createdAt: "desc" },
            include: {
              admin: {
                select: { email: true, author: { select: { name: true } } },
              },
            },
          },
          fieldAudits: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              field: true,
              fromValue: true,
              toValue: true,
              createdAt: true,
              admin: {
                select: { email: true, author: { select: { name: true } } },
              },
            },
          },
        }),
      },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    // Enforce author ownership
    if (authReq.user.role === "AUTHOR") {
      const user = await prisma.user.findUnique({
        where: { id: authReq.user.id },
        select: { authorId: true },
      });
      if (!user?.authorId || ticket.authorId !== user.authorId) {
        return res.status(403).json({ error: "You can only view your own tickets" });
      }
      // Mark ticket as read by author
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { authorLastReadAt: new Date() },
      });
      ticket.authorLastReadAt = new Date();
    }
    return res.json({
      ticket: {
        ...ticket,
        overdue: isTicketOverdue(ticket.createdAt, ticket.priority),
        royaltyOverdueDays: getRoyaltyOverdueDays(ticket.book),
      },
    });
  } catch (error) {
    console.error("Failed to fetch ticket:", error);
    return res.status(500).json({ error: "Failed to fetch ticket" });
  }
});
// Send a reply to a support ticket.
router.post(
  "/:id/messages",
  requireAuth,
  ticketReplyLimiter,
  (req, res, next) => {
    uploadMiddleware.single("file")(req, res, (err: any) => {
      if (err) {
        return res.status(400).json({ error: err.message || "File upload failed" });
      }
      next();
    });
  },
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const ticketId = Number(req.params.id);

    if (!Number.isSafeInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({
        error: "Invalid ticket ID",
      });
    }

    const content = typeof req.body.content === "string" ? req.body.content.trim() : "";

    if (!content && !req.file) {
      return res.status(400).json({
        error: "Message must contain text or an attachment",
      });
    }

    if (content.length > 5000) {
      return res.status(400).json({
        error: "Message must not exceed 5000 characters",
      });
    }

    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { id: true, authorId: true, status: true },
      });

      if (!ticket) {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      if (ticket.status === "CLOSED") {
        return res.status(409).json({
          code: "TICKET_CLOSED",
          error: "Replies are turned off for closed tickets",
        });
      }

      if (authReq.user.role === "ADMIN" && content && /\[ADMIN:/i.test(content)) {
        return res.status(400).json({
          error: "Cannot send reply containing unresolved placeholder. Please resolve all [ADMIN: ...] tags before sending.",
        });
      }

      if (authReq.user.role === "AUTHOR") {
        const user = await prisma.user.findUnique({
          where: { id: authReq.user.id },
          select: { authorId: true },
        });

        if (!user?.authorId) {
          return res.status(403).json({
            error: "Your account is not linked to an author profile",
          });
        }

        if (ticket.authorId !== user.authorId) {
          return res.status(403).json({
            error: "You can only reply to your own tickets",
          });
        }
      }

      let attachmentCreate = undefined;
      if (req.file) {
        const stored = await storage.save(req.file);
        attachmentCreate = {
          create: [
            {
              filename: stored.filename,
              url: stored.url,
              mimeType: stored.mimeType,
              size: stored.size,
              ticketId: ticket.id,
            },
          ],
        };
      }

      const message = await prisma.ticketMessage.create({
        data: {
          content: content || req.file?.originalname || "Attachment",
          ticketId: ticket.id,
          senderId: authReq.user.id,
          isAdmin: authReq.user.role === "ADMIN",
          ...(attachmentCreate ? { attachments: attachmentCreate } : {}),
        },
        include: {
          sender: {
            select: {
              email: true,
              author: { select: { name: true } },
            },
          },
          attachments: {
            select: {
              id: true,
              filename: true,
              url: true,
              mimeType: true,
              size: true,
              createdAt: true,
            },
          },
        },
      });

      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { updatedAt: new Date() },
      });

      return res.status(201).json({
        message: "Reply sent successfully",
        reply: message,
      });
    } catch (error) {
      console.error("Failed to send ticket reply:", error);
      return res.status(500).json({
        error: "Failed to send reply",
      });
    }
  });

router.get("/:id/messages", requireAuth, ticketReadLimiter, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.user) {
    return res.status(401).json({
      error: "Authentication required",
    });
  }

  const ticketId = Number(req.params.id);

  if (!Number.isSafeInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({
      error: "Invalid ticket ID",
    });
  }

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, authorId: true },
    });

    if (!ticket) {
      return res.status(404).json({
        error: "Ticket not found",
      });
    }

    if (authReq.user.role === "AUTHOR") {
      const user = await prisma.user.findUnique({
        where: { id: authReq.user.id },
        select: { authorId: true },
      });

      if (!user?.authorId) {
        return res.status(403).json({
          error: "Your account is not linked to an author profile",
        });
      }

      if (ticket.authorId !== user.authorId) {
        return res.status(403).json({
          error: "You can only view messages on your own tickets",
        });
      }
    }

    const messages = await prisma.ticketMessage.findMany({
      where: { ticketId },
      orderBy: [
        { createdAt: "asc" },
        { id: "asc" },
      ],
      select: {
        id: true,
        content: true,
        isAdmin: true,
        ticketId: true,
        senderId: true,
        createdAt: true,
        sender: {
          select: {
            email: true,
            author: { select: { name: true } },
          },
        },
        attachments: {
          select: {
            id: true,
            filename: true,
            url: true,
            mimeType: true,
            size: true,
            createdAt: true,
          },
        },
      },
    });

    return res.json({ messages });
  } catch (error) {
    console.error("Failed to fetch ticket messages:", error);
    return res.status(500).json({
      error: "Failed to fetch ticket messages",
    });
  }
});

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["OPEN", "RESOLVED", "CLOSED"],
  RESOLVED: ["IN_PROGRESS", "OPEN", "CLOSED"],
  CLOSED: [],
};

const updateTicketStatusSchema = z.object({
  status: z.enum([
    "OPEN",
    "IN_PROGRESS",
    "RESOLVED",
    "CLOSED",
  ]),
  expectedStatus: z
    .enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"])
    .optional(),
  reason: z.string().trim().optional(),
});

export async function updateTicketStatus(
  ticketId: number,
  adminId: number,
  payload: {
    status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
    expectedStatus?: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | undefined;
    reason?: string | undefined;
  }
) {
  const existing = await prisma.ticket.findUnique({
    where: { id: ticketId },
  });

  if (!existing) {
    const error: any = new Error("Ticket not found");
    error.status = 404;
    throw error;
  }

  if (existing.status === "CLOSED") {
    const error: any = new Error("Closed tickets cannot be modified");
    error.status = 409;
    error.code = "TICKET_CLOSED";
    error.allowedStatuses = [];
    throw error;
  }

  const nextStatus = payload.status;
  if (existing.status === nextStatus) {
    return { noOp: true, ticket: existing };
  }

  const allowed = ALLOWED_STATUS_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(nextStatus)) {
    const error: any = new Error(`Cannot transition status from ${existing.status} to ${nextStatus}`);
    error.status = 409;
    error.allowedStatuses = allowed;
    throw error;
  }

  const isReopening = existing.status === "RESOLVED" && (nextStatus === "OPEN" || nextStatus === "IN_PROGRESS");
  const trimmedReason = payload.reason?.trim() || "";

  if (isReopening && trimmedReason.length < 10) {
    const error: any = new Error("A reason of at least 10 characters is required when reopening a resolved ticket");
    error.status = 400;
    throw error;
  }

  if (payload.expectedStatus && existing.status !== payload.expectedStatus) {
    throw new ConcurrentModificationError("This ticket was modified by another staff member. Please refresh to see the latest status.");
  }

  const statusToMatch = payload.expectedStatus ?? existing.status;
  const [updatedTicket] = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.ticket.updateMany({
      where: {
        id: ticketId,
        status: statusToMatch,
      },
      data: {
        status: nextStatus,
        statusSource: "ADMIN",
      },
    });

    if (updateResult.count === 0) {
      throw new ConcurrentModificationError();
    }

    await tx.ticketStatusAudit.create({
      data: {
        ticketId,
        adminId,
        fromStatus: existing.status,
        toStatus: nextStatus,
        reason: trimmedReason.length > 0 ? trimmedReason : null,
      },
    });

    const updated = await tx.ticket.findUnique({
      where: { id: ticketId },
      include: {
        author: true,
        book: true,
        assignedAdmin: {
          select: { id: true, email: true },
        },
      },
    });

    return [updated!];
  });

  return { noOp: false, ticket: updatedTicket };
}

// Update ticket status (admins only).
router.patch("/:id/status", requireAuth, requireAdmin, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const ticketId = Number(req.params.id);

  if (!Number.isSafeInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({ error: "Invalid ticket ID" });
  }

  const parsed = updateTicketStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid ticket status",
      allowedStatuses: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
    });
  }

  try {
    const result = await updateTicketStatus(ticketId, authReq.user!.id, parsed.data);
    return res.json({
      message: result.noOp
        ? "Ticket status already set to this value"
        : "Ticket status updated successfully",
      ticket: result.ticket,
    });
  } catch (error: any) {
    if (error instanceof ConcurrentModificationError) {
      return res.status(409).json({
        code: "CONCURRENT_MODIFICATION",
        error: error.message,
      });
    }
    if (error.status) {
      return res.status(error.status).json({
        code: error.code,
        error: error.message,
        allowedStatuses: error.allowedStatuses,
      });
    }

    console.error("Failed to update ticket status:", error);
    return res.status(500).json({ error: "Failed to update ticket status" });
  }
});

const updateTicketPrioritySchema = z
  .object({
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
    expectedPriority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    useAiSuggestion: z.boolean().optional(),
  })
  .refine(
    (data) => !(data.priority !== undefined && data.useAiSuggestion === true),
    { message: "Cannot provide both priority and useAiSuggestion" }
  )
  .refine(
    (data) => data.priority !== undefined || data.useAiSuggestion === true,
    { message: "Must provide either priority or useAiSuggestion: true" }
  );

export async function updateTicketPriority(
  ticketId: number,
  adminId: number,
  payload: {
    priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | undefined;
    expectedPriority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    useAiSuggestion?: boolean | undefined;
  }
) {
  const existing = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      priority: true,
      prioritySource: true,
      aiPriority: true,
      aiReason: true,
      status: true,
    },
  });

  if (!existing) {
    const error: any = new Error("Ticket not found");
    error.status = 404;
    throw error;
  }

  if (existing.status === "CLOSED") {
    const error: any = new Error("Closed tickets cannot be modified");
    error.status = 409;
    error.code = "TICKET_CLOSED";
    throw error;
  }

  let targetPriority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  let targetReason: string;

  if (payload.useAiSuggestion) {
    if (!existing.aiPriority) {
      const error: any = new Error("Ticket does not have an AI priority suggestion");
      error.status = 400;
      throw error;
    }
    targetPriority = existing.aiPriority;
    targetReason = existing.aiReason ?? "Administrator accepted AI suggestion";
  } else {
    targetPriority = payload.priority!;
    targetReason = "Manually adjusted by administrator";
  }

  // Concurrency check before no-op
  if (existing.priority !== payload.expectedPriority) {
    throw new ConcurrentModificationError("This ticket was modified by another staff member. Please refresh to see the latest priority.");
  }

  // No-op check after concurrency check
  if (targetPriority === existing.priority) {
    if (existing.prioritySource !== "ADMIN") {
      await prisma.ticket.updateMany({
        where: { id: ticketId, prioritySource: { not: "ADMIN" } },
        data: { prioritySource: "ADMIN" },
      });
    }
    const freshTicket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        author: { select: { id: true, name: true, email: true, authorId: true } },
        book: { select: { id: true, title: true, royaltyPending: true, lastRoyaltyPayoutDate: true } },
        assignedAdmin: { select: { email: true } },
      },
    });
    return { noOp: true, ticket: { ...freshTicket!, overdue: isTicketOverdue(freshTicket!.createdAt, freshTicket!.priority), royaltyOverdueDays: getRoyaltyOverdueDays(freshTicket!.book) } };
  }

  // Interactive transaction with conditional update
  await prisma.$transaction(async (tx) => {
    const updateResult = await tx.ticket.updateMany({
      where: {
        id: ticketId,
        priority: payload.expectedPriority,
      },
      data: {
        priority: targetPriority,
        prioritySource: "ADMIN",
        priorityReason: targetReason,
      },
    });

    if (updateResult.count === 0) {
      throw new ConcurrentModificationError();
    }

    await tx.ticketFieldAudit.create({
      data: {
        ticketId,
        adminId,
        field: "PRIORITY",
        fromValue: payload.expectedPriority,
        toValue: targetPriority,
      },
    });
  });

  const freshTicket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      author: { select: { id: true, name: true, email: true, authorId: true } },
      book: { select: { id: true, title: true, royaltyPending: true, lastRoyaltyPayoutDate: true } },
      assignedAdmin: { select: { email: true } },
    },
  });

  return { noOp: false, ticket: { ...freshTicket!, overdue: isTicketOverdue(freshTicket!.createdAt, freshTicket!.priority), royaltyOverdueDays: getRoyaltyOverdueDays(freshTicket!.book) } };
}

// Update ticket priority (admins only).
router.patch(
  "/:id/priority",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const ticketId = Number(req.params.id);

    if (!Number.isSafeInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({
        error: "Invalid ticket ID",
      });
    }

    const parsed = updateTicketPrioritySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid ticket priority update payload",
        details: parsed.error.flatten(),
      });
    }

    try {
      const result = await updateTicketPriority(ticketId, authReq.user!.id, parsed.data);
      return res.json({
        message: result.noOp
          ? "Ticket priority already set to this value"
          : "Ticket priority updated successfully",
        ticket: result.ticket,
      });
    } catch (error: any) {
      if (error instanceof ConcurrentModificationError) {
        return res.status(409).json({
          code: "CONCURRENT_MODIFICATION",
          error: error.message,
        });
      }
      if (error.status) {
        return res.status(error.status).json({
          code: error.code,
          error: error.message,
        });
      }

      console.error("Failed to update ticket priority:", error);
      return res.status(500).json({
        error: "Failed to update ticket priority",
      });
    }
  },
);

export const updateTicketCategorySchema = z.object({
  category: z.enum([
    "ROYALTY_PAYMENTS",
    "ISBN_METADATA",
    "PRINTING_QUALITY",
    "DISTRIBUTION_AVAILABILITY",
    "BOOK_STATUS_PRODUCTION",
    "GENERAL_INQUIRY",
  ]),
  expectedCategory: z.enum([
    "ROYALTY_PAYMENTS",
    "ISBN_METADATA",
    "PRINTING_QUALITY",
    "DISTRIBUTION_AVAILABILITY",
    "BOOK_STATUS_PRODUCTION",
    "GENERAL_INQUIRY",
  ]),
});

export async function updateTicketCategory(
  ticketId: number,
  adminId: number,
  payload: {
    category: "ROYALTY_PAYMENTS" | "ISBN_METADATA" | "PRINTING_QUALITY" | "DISTRIBUTION_AVAILABILITY" | "BOOK_STATUS_PRODUCTION" | "GENERAL_INQUIRY";
    expectedCategory: "ROYALTY_PAYMENTS" | "ISBN_METADATA" | "PRINTING_QUALITY" | "DISTRIBUTION_AVAILABILITY" | "BOOK_STATUS_PRODUCTION" | "GENERAL_INQUIRY";
  }
) {
  const existing = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, category: true, categorySource: true, status: true },
  });

  if (!existing) {
    const error: any = new Error("Ticket not found");
    error.status = 404;
    throw error;
  }

  if (existing.status === "CLOSED") {
    const error: any = new Error("Closed tickets cannot be modified");
    error.status = 409;
    error.code = "TICKET_CLOSED";
    throw error;
  }

  // Concurrency check before no-op
  if (existing.category !== payload.expectedCategory) {
    throw new ConcurrentModificationError("This ticket was modified by another staff member. Please refresh to see the latest category.");
  }

  // No-op check after concurrency check
  if (payload.category === existing.category) {
    if (existing.categorySource !== "ADMIN") {
      await prisma.ticket.updateMany({
        where: { id: ticketId, categorySource: { not: "ADMIN" } },
        data: { categorySource: "ADMIN" },
      });
    }
    const freshTicket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        author: { select: { id: true, name: true, email: true, authorId: true } },
        book: { select: { id: true, title: true, royaltyPending: true, lastRoyaltyPayoutDate: true } },
        assignedAdmin: { select: { email: true } },
      },
    });
    return { noOp: true, ticket: { ...freshTicket!, overdue: isTicketOverdue(freshTicket!.createdAt, freshTicket!.priority), royaltyOverdueDays: getRoyaltyOverdueDays(freshTicket!.book) } };
  }

  // Interactive transaction with conditional update
  await prisma.$transaction(async (tx) => {
    const updateResult = await tx.ticket.updateMany({
      where: {
        id: ticketId,
        category: payload.expectedCategory,
      },
      data: {
        category: payload.category,
        categorySource: "ADMIN",
      },
    });

    if (updateResult.count === 0) {
      throw new ConcurrentModificationError();
    }

    await tx.ticketFieldAudit.create({
      data: {
        ticketId,
        adminId,
        field: "CATEGORY",
        fromValue: payload.expectedCategory,
        toValue: payload.category,
      },
    });
  });

  const freshTicket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      author: { select: { id: true, name: true, email: true, authorId: true } },
      book: { select: { id: true, title: true, royaltyPending: true, lastRoyaltyPayoutDate: true } },
      assignedAdmin: { select: { email: true } },
    },
  });

  return { noOp: false, ticket: { ...freshTicket!, overdue: isTicketOverdue(freshTicket!.createdAt, freshTicket!.priority), royaltyOverdueDays: getRoyaltyOverdueDays(freshTicket!.book) } };
}

router.patch("/:id/category", requireAuth, requireAdmin, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const ticketId = Number(req.params.id);

  if (!Number.isSafeInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({ error: "Invalid ticket ID" });
  }

  const parsed = updateTicketCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid category update payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const result = await updateTicketCategory(ticketId, authReq.user!.id, parsed.data);
    return res.json({
      message: result.noOp
        ? "Ticket category already set to this value"
        : "Ticket category updated successfully",
      ticket: result.ticket,
    });
  } catch (error: any) {
    if (error instanceof ConcurrentModificationError) {
      return res.status(409).json({
        code: "CONCURRENT_MODIFICATION",
        error: error.message,
      });
    }
    if (error.status) {
      return res.status(error.status).json({
        code: error.code,
        error: error.message,
      });
    }

    console.error("Failed to update ticket category:", error);
    return res.status(500).json({ error: "Failed to update ticket category" });
  }
});

/**
 * Strict contract for AI classifier outputs.
 * Note: isWrongIsbn is a dedicated boolean field in the classifier output schema.
 * If missing, it defaults to false.
 */
export const classifierOutputSchema = z.object({
  category: z.enum([
    "ROYALTY_PAYMENTS",
    "ISBN_METADATA",
    "PRINTING_QUALITY",
    "DISTRIBUTION_AVAILABILITY",
    "BOOK_STATUS_PRODUCTION",
    "GENERAL_INQUIRY",
  ]),
  rawPriority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  isWrongIsbn: z.boolean().default(false),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
});

export type ClassifierOutput = z.infer<typeof classifierOutputSchema>;

const draftRequestSchema = z.object({
  regenerate: z.boolean().optional(),
});

/**
 * Draft a reply when an admin opens a ticket.
 * Grounded in verified server facts and category KB docs.
 * Cached per latest author message ID (idempotent, supports regenerate: true).
 */
router.post("/:id/draft", requireAuth, requireAdmin, async (req, res) => {
  const ticketId = Number(req.params.id);
  if (!Number.isSafeInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({ error: "Invalid ticket ID" });
  }

  const parsedBody = draftRequestSchema.safeParse(req.body);
  const regenerate = parsedBody.success ? parsedBody.data.regenerate === true : false;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        subject: true,
        description: true,
        status: true,
        category: true,
        priority: true,
        author: {
          select: {
            name: true, // Only name; no email, phone, or bank details
          },
        },
        book: {
          select: {
            title: true,
            isbn: true,
            status: true,
            mrp: true,
            totalCopiesSold: true,
            royaltyPending: true,
            royaltyPaid: true,
            lastRoyaltyPayoutDate: true,
          },
        },
        messages: {
          select: {
            id: true,
            content: true,
            isAdmin: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    if (ticket.status === "CLOSED") {
      return res.status(400).json({ error: "Cannot generate drafts for closed tickets" });
    }

    const latestAuthorMessage = [...ticket.messages].reverse().find((m) => !m.isAdmin);
    const authorMsgId = latestAuthorMessage?.id ?? 0;

    // Return cached draft if exists and not explicitly regenerating
    if (!regenerate && authorMsgId > 0) {
      const cached = await prisma.ticketDraft.findUnique({
        where: {
          ticketId_authorMsgId: {
            ticketId,
            authorMsgId,
          },
        },
      });

      if (cached) {
        return res.json({
          body: cached.body,
          placeholders: cached.placeholders,
          factsUsed: cached.factsUsed,
        });
      }
    }

    // Daily cap check before calling paid model
    await checkDailyAiCap();

    const startTime = Date.now();

    // Prepare verified server facts
    const overdueDays = ticket.book ? getRoyaltyOverdueDays(ticket.book) : 0;
    const isOverdue = ticket.book ? isRoyaltyOverdue(ticket.book) : false;
    const pendingAmount = ticket.book?.royaltyPending ? Number(ticket.book.royaltyPending) : 0;
    const paidAmount = ticket.book?.royaltyPaid ? Number(ticket.book.royaltyPaid) : 0;

    const serverFacts: Array<{ label: string; value: string }> = [
      { label: "Ticket ID", value: `#${ticket.id}` },
      { label: "Author Name", value: ticket.author.name },
      { label: "Book Title", value: ticket.book?.title ?? "General Account" },
      { label: "Book Status", value: ticket.book?.status ?? "N/A" },
      { label: "ISBN", value: ticket.book?.isbn ?? "N/A" },
      { label: "Royalty Pending", value: `₹${pendingAmount.toFixed(2)}` },
      { label: "Royalty Paid", value: `₹${paidAmount.toFixed(2)}` },
      { label: "Payout Overdue", value: isOverdue ? `Yes (${overdueDays} days)` : "No" },
    ];

    if (ticket.book?.lastRoyaltyPayoutDate) {
      serverFacts.push({
        label: "Last Payout Date",
        value: new Date(ticket.book.lastRoyaltyPayoutDate).toISOString().split("T")[0]!,
      });
    }

    // Load single category KB docs
    const kb = await getCategoryKb(ticket.category);

    const formattedMessages = ticket.messages.map((m) => ({
      sender: (m.isAdmin ? "Admin" : "Author") as "Admin" | "Author",
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    }));

    const authorText = [
      ticket.subject,
      ticket.description,
      ...ticket.messages.filter((m) => !m.isAdmin).map((m) => m.content),
    ].join(" ");

    const prompt = buildDraftPrompt({
      category: ticket.category,
      authorName: ticket.author.name,
      generalTone: kb.generalTone,
      categoryRules: kb.categoryRules,
      samples: kb.samples,
      serverFacts,
      messages: formattedMessages,
      ticket,
    });


    let rawDraft;
    try {
      const client =
        process.env.USE_FAKE_AI === "true" || process.env.GEMINI_API_KEY === "mock"
          ? new FakeClient()
          : getGeminiClient();
      rawDraft = await client.draft(prompt);
    } catch (llmError) {
      console.warn(`Gemini call failed for ticket #${ticketId}, falling back to fake AI:`, llmError);
      const fallbackClient = new FakeClient();
      rawDraft = await fallbackClient.draft(prompt);
    }

    // Run factual verifier against server facts, KB constants, and author-stated text
    const verified = verifyDraft({
      body: rawDraft.body,
      serverFacts,
      authorText,
    });

    // Cache the draft for this author message
    if (authorMsgId > 0) {
      await prisma.ticketDraft.upsert({
        where: {
          ticketId_authorMsgId: {
            ticketId,
            authorMsgId,
          },
        },
        create: {
          ticketId,
          authorMsgId,
          body: verified.body,
          placeholders: verified.placeholders,
          factsUsed: verified.factsUsed as any,
        },
        update: {
          body: verified.body,
          placeholders: verified.placeholders,
          factsUsed: verified.factsUsed as any,
        },
      });
    }

    await logAiCall({
      type: "DRAFT",
      status: "SUCCESS",
      ticketId,
      durationMs: Date.now() - startTime,
    });

    return res.json(verified);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Failed to generate draft reply";
    console.error(`Failed to generate draft for ticket #${ticketId}:`, errorMsg);
    await logAiCall({ type: "DRAFT", status: "FAILED", ticketId });
    if (errorMsg.includes("Daily AI cap") || isQuotaOrRateLimitError(error)) {
      return res.status(429).json({
        error: errorMsg.includes("Daily AI cap")
          ? errorMsg
          : "AI rate limit reached. Please wait a moment before requesting another draft.",
      });
    }
    return res.status(502).json({ error: "The AI draft is unavailable. Check the server log for details." });
  }
});

router.patch("/:id/assignment", requireAuth, requireAdmin, async (req, res) => {
  const ticketId = Number(req.params.id);
  if (!Number.isSafeInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({ error: "Invalid ticket ID" });
  }
  try {
    const ticket = await prisma.ticket.update({
      where: { id: ticketId },
      data: { assignedAdminId: (req as AuthenticatedRequest).user!.id },
    });
    return res.json({ message: "Ticket assigned successfully", ticket });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return res.status(404).json({ error: "Ticket not found" });
    }
    console.error("Failed to assign ticket:", error);
    return res.status(500).json({ error: "Failed to assign ticket" });
  }
});

const noteSchema = z.object({ content: z.string().trim().min(2).max(5000) });

router.get("/:id/notes", requireAuth, requireAdmin, async (req, res) => {
  const ticketId = Number(req.params.id);
  if (!Number.isSafeInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({ error: "Invalid ticket ID" });
  }
  try {
    const notes = await prisma.internalNote.findMany({
      where: { ticketId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { admin: { select: { email: true, author: { select: { name: true } } } } },
    });
    return res.json({ notes });
  } catch (error) {
    console.error("Failed to fetch notes:", error);
    return res.status(500).json({ error: "Failed to fetch notes" });
  }

});

router.post("/:id/notes", requireAuth, requireAdmin, async (req, res) => {
  const ticketId = Number(req.params.id);
  const parsed = noteSchema.safeParse(req.body);
  if (!Number.isSafeInteger(ticketId) || ticketId <= 0 || !parsed.success) {
    return res.status(400).json({ error: "Invalid internal note" });
  }
  try {
    const note = await prisma.internalNote.create({
      data: { ticketId, adminId: (req as AuthenticatedRequest).user!.id, content: parsed.data.content },
      include: { admin: { select: { email: true, author: { select: { name: true } } } } },
    });
    return res.status(201).json({ note });
  } catch (error) {
    console.error("Failed to create note:", error);
    return res.status(500).json({ error: "Failed to create note" });
  }
});

export default router;

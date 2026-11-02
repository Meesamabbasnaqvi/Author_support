import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";

export const CATEGORIES = [
  "ROYALTY_PAYMENTS",
  "ISBN_METADATA",
  "PRINTING_QUALITY",
  "DISTRIBUTION_AVAILABILITY",
  "BOOK_STATUS_PRODUCTION",
  "GENERAL_INQUIRY",
] as const;

export const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

// Explicit true/false only. z.coerce.boolean() would turn "false" into true.
const booleanString = z.enum(["true", "false"]).transform((v) => v === "true");

export const listTicketsQuerySchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    category: z.enum(CATEGORIES).optional(),
    assignedAdminId: z.coerce.number().int().positive().optional(),
    unassigned: booleanString.optional(),
  })
  .refine((f) => !(f.unassigned === true && f.assignedAdminId !== undefined), {
    message: "Use either unassigned or assignedAdminId, not both",
  });

export type ListTicketsFilters = z.infer<typeof listTicketsQuerySchema>;

/**
 * Builds the WHERE clause. `authorId` scopes the query for authors; admins pass nothing.
 * Every filter maps to an indexed column (see the Ticket @@index lines in schema.prisma).
 */
export function buildTicketWhere(
  filters: ListTicketsFilters,
  scope: { authorId?: number | undefined }
): Prisma.TicketWhereInput {
  const where: Prisma.TicketWhereInput = {};

  if (scope.authorId !== undefined) where.authorId = scope.authorId;
  if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.category) where.category = filters.category;

  if (filters.unassigned === true) {
    where.assignedAdminId = null;
  } else if (filters.assignedAdminId !== undefined) {
    where.assignedAdminId = filters.assignedAdminId;
  }

  return where;
}

/**
 * List response shape. The latest message only, for the queue preview.
 * The full thread and audit history load on GET /tickets/:id.
 */
export const ticketListInclude = {
  author: { select: { id: true, name: true, email: true, authorId: true } },
  book: {
    select: { id: true, title: true, royaltyPending: true, lastRoyaltyPayoutDate: true },
  },
  messages: {
    orderBy: { createdAt: "desc" },
    take: 1,
    include: {
      sender: { select: { email: true, author: { select: { name: true } } } },
    },
  },
  assignedAdmin: { select: { email: true } },
  _count: { select: { messages: true } },
} satisfies Prisma.TicketInclude;
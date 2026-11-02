// Shapes follow the API contract in SYSTEM_DESIGN.md. Keep these in sync with the backend.

export type Role = "AUTHOR" | "ADMIN";

export interface Me {
  id: number;
  name: string;
  email: string;
  role: Role;
  authorId?: number;
}

// The brief defines exactly these four statuses.
export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type Category =
  | "ROYALTY_PAYMENTS"
  | "ISBN_METADATA"
  | "PRINTING_QUALITY"
  | "DISTRIBUTION_AVAILABILITY"
  | "BOOK_STATUS_PRODUCTION"
  | "GENERAL_INQUIRY";

export type AiState = "CLASSIFIED" | "PENDING" | "UNAVAILABLE";
export type FieldSource = "DEFAULT" | "AUTHOR" | "AI" | "ADMIN" | "RULE";

export interface Book {
  id: number;
  title: string;
  isbn: string;
  genre: string;
  publicationDate: string | null; // null while the book is still in production
  status: string;
  productionStage?: string;
  copiesSold: number;
  mrp: number;
  royaltyEarned: number;
  royaltyPaid: number;
  royaltyPending: number;
  platforms: string[];
}

export interface AuthorSummary {
  id: number;
  name: string;
  email: string;
  royaltyPendingTotal: number;
  nextPayoutDeadline: string; // ISO date
  minimumPayout: number;
  bankDetailsStatus?: string;
}

export interface AttachmentItem {
  id: number;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt?: string;
}

export interface TicketMessage {
  id: number;
  isAdmin: boolean;
  senderName: string;
  body: string;
  createdAt: string;
  attachments?: AttachmentItem[];
}

export interface TicketListItem {
  id: number;
  subject: string;
  status: TicketStatus;
  category: Category;
  priority: Priority;
  updatedAt: string;
  createdAt: string;
  overdue: boolean;
  royaltyOverdueDays?: number;

  // Database / relation fields from GET /tickets
  author?: { id?: number; name: string | null; email: string; authorId?: number | string | null; bankDetailsStatus?: string };
  book?: { id: number; title: string; royaltyPending?: string | number | null; lastRoyaltyPayoutDate?: string | null } | null;
  messages?: Array<{
    id: number;
    content?: string;
    body?: string;
    isAdmin: boolean;
    createdAt: string;
    sender?: { email: string; author?: { name: string | null } | null } | null;
    senderName?: string;
    attachments?: AttachmentItem[];
  }>;
  messageCount?: number;
  assignedAdmin?: { email: string } | null;

  // Client view / mapped fields
  bookTitle?: string;
  authorName?: string;
  hasNewReply?: boolean; // author-side flag: an admin replied since the author last looked
  aiState?: AiState;
  categorySource?: FieldSource;
  prioritySource?: FieldSource;
  priorityReason?: string;
  assignedAdminName?: string;
}

export interface TicketStatusAuditItem {
  id: number;
  fromStatus: TicketStatus;
  toStatus: TicketStatus;
  reason: string | null;
  createdAt: string;
  admin: { email: string; author?: { name: string } | null };
}

export interface TicketFieldAuditItem {
  id: number;
  field: "CATEGORY" | "PRIORITY";
  fromValue: string;
  toValue: string;
  createdAt: string;
  admin: { email: string; author?: { name: string } | null };
}

export interface AuthorBookSummary {
  id: number;
  bookId: string;
  title: string;
  isbn?: string | null;
  genre?: string | null;
  status: string;
  mrp?: number | string | null;
  royaltyPending?: number | string | null;
  royaltyPaid?: number | string | null;
  lastRoyaltyPayoutDate?: string | null;
  totalCopiesSold?: number;
}

export interface AuthorProfileSummary {
  id?: number;
  name: string;
  email: string;
  authorId?: string;
  phone?: string | null;
  city?: string | null;
  joinedDate?: string | null;
  bankDetailsStatus?: string;
  totalBooks?: number;
  books?: AuthorBookSummary[];
}

export interface TicketDetail extends TicketListItem {
  description: string;
  authorName: string;
  messages: TicketMessage[];
  aiCategory?: Category;
  aiPriority?: Priority;
  author: AuthorProfileSummary;
  statusAudits?: TicketStatusAuditItem[];
  fieldAudits?: TicketFieldAuditItem[];
}

export interface InternalNote {
  id: number;
  adminName: string;
  body: string;
  createdAt: string;
}

export interface AiDraft {
  body: string;
  placeholders: string[]; // each one must be filled before the reply can be sent
  factsUsed: { label: string; value: string }[];
}

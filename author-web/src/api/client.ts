import type {
  AiDraft, AttachmentItem, AuthorBookSummary, AuthorSummary, Book, Category, InternalNote, Me, Priority,
  TicketDetail, TicketListItem, TicketStatus,
} from "./types";

const TOKEN_KEY = "author-support-token";
const API_PREFIX = "/api";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export interface QueueFilters {
  status?: TicketStatus | "ALL";
  priority?: Priority | "ALL";
  category?: Category | "ALL";
  from?: string;
  to?: string;
}

export interface DashboardCounts {
  open: number;
  critical: number;
  overdue: number;
  awaitingClassification: number;
  unassigned: number;
}

type BackendUser = { id: number; email: string; role: "AUTHOR" | "ADMIN"; authorId?: number; name?: string };
type BackendTicket = {
  id: number; subject: string; description: string; status: TicketStatus;
  category: Category; categorySource: "DEFAULT" | "AI" | "ADMIN";
  aiCategory: Category | null; priority: Priority; prioritySource: "DEFAULT" | "AI" | "ADMIN" | "RULE";
  priorityReason?: string | null; overdue?: boolean; royaltyOverdueDays?: number;
  aiPriority: Priority | null; aiStatus: "PENDING" | "DONE" | "FAILED";
  aiConfidence: number | null; aiReason: string | null;
  createdAt: string; updatedAt: string;
  author: {
    id?: number;
    name: string;
    email: string;
    authorId?: string;
    phone?: string | null;
    city?: string | null;
    joinedDate?: string | null;
    _count?: { books: number };
    books?: AuthorBookSummary[];
  };
  book: { id: number; title: string } | null;
  assignedAdmin: { email: string } | null;
  authorLastReadAt?: string | null;
  statusAudits?: Array<{
    id: number;
    fromStatus: TicketStatus;
    toStatus: TicketStatus;
    reason: string | null;
    createdAt: string;
    admin: { email: string; author?: { name: string } | null };
  }>;
  fieldAudits?: Array<{
    id: number;
    field: "CATEGORY" | "PRIORITY";
    fromValue: string;
    toValue: string;
    createdAt: string;
    admin: { email: string; author?: { name: string } | null };
  }>;
  messages: Array<{
    id: number; content: string; isAdmin: boolean; createdAt: string;
    sender?: { email: string; author: { name: string } | null } | null;
    attachments?: AttachmentItem[];
  }>;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_PREFIX}${path}`, { ...init, headers });
  const body = await response.json().catch(() => null) as {
    code?: string;
    error?: string;
    details?: { fieldErrors?: Record<string, string[]> };
  } | null;
  if (!response.ok) {
    const fieldErrors = body?.details?.fieldErrors;
    const detail = fieldErrors
      ? Object.values(fieldErrors).flat().join(" ")
      : undefined;
    throw new ApiError(
      body?.code ?? (response.status === 401 ? "UNAUTHORIZED" : "API_ERROR"),
      detail ? `${body?.error ?? "Request failed"}: ${detail}` : body?.error ?? "Request failed",
      response.status,
    );
  }
  return body as T;
}

const mapUser = (user: BackendUser): Me => ({
  id: user.id, email: user.email, role: user.role, authorId: user.authorId, name: user.name ?? user.email,
});

const mapTicket = (ticket: BackendTicket): TicketDetail => ({
  id: ticket.id, subject: ticket.subject, description: ticket.description,
  status: ticket.status, category: ticket.category, priority: ticket.priority,
  categorySource: ticket.categorySource, prioritySource: ticket.prioritySource,
  priorityReason: ticket.priorityReason ?? undefined,
  aiCategory: ticket.aiCategory ?? undefined,
  aiPriority: ticket.aiPriority ?? undefined,
  bookTitle: ticket.book?.title, authorName: ticket.author.name,
  author: {
    id: ticket.author.id,
    name: ticket.author.name,
    email: ticket.author.email,
    authorId: ticket.author.authorId,
    phone: ticket.author.phone,
    city: ticket.author.city,
    joinedDate: ticket.author.joinedDate,
    totalBooks: ticket.author._count?.books ?? (ticket.author.books ? ticket.author.books.length : 0),
    books: ticket.author.books ?? [],
  },
  statusAudits: ticket.statusAudits,
  fieldAudits: ticket.fieldAudits,
  createdAt: ticket.createdAt, updatedAt: ticket.updatedAt,
  hasNewReply: (() => {
    const lastAdminMsg = [...ticket.messages].reverse().find((m) => m.isAdmin);
    if (!lastAdminMsg) return false;
    if (!ticket.authorLastReadAt) return true;
    return new Date(lastAdminMsg.createdAt).getTime() > new Date(ticket.authorLastReadAt).getTime();
  })(),
  aiState: ticket.aiStatus === "DONE" ? "CLASSIFIED" : ticket.aiStatus === "FAILED" ? "UNAVAILABLE" : "PENDING",
  overdue: !!ticket.overdue, royaltyOverdueDays: ticket.royaltyOverdueDays ?? 0, assignedAdminName: ticket.assignedAdmin?.email,
  messages: (ticket.messages && ticket.messages.length > 0)
    ? ticket.messages.map((message) => ({
        id: message.id,
        isAdmin: message.isAdmin,
        senderName: message.sender?.author?.name ?? message.sender?.email ?? (message.isAdmin ? "BookLeaf Support" : ticket.author.name),
        body: message.content,
        createdAt: message.createdAt,
        attachments: message.attachments ?? [],
      }))
    : ticket.description
    ? [
        {
          id: 0,
          isAdmin: false,
          senderName: ticket.author.name,
          body: ticket.description,
          createdAt: ticket.createdAt,
          attachments: [],
        },
      ]
    : [],
});

async function loadTickets(filters?: QueueFilters): Promise<TicketDetail[]> {
  const result = await request<{ tickets: BackendTicket[] }>("/tickets");
  let rows = result.tickets.map(mapTicket);
  if (filters?.status && filters.status !== "ALL") rows = rows.filter((row) => row.status === filters.status);
  if (filters?.priority && filters.priority !== "ALL") rows = rows.filter((row) => row.priority === filters.priority);
  if (filters?.category && filters.category !== "ALL") rows = rows.filter((row) => row.category === filters.category);
  if (filters?.from) rows = rows.filter((row) => row.createdAt.slice(0, 10) >= filters.from!);
  if (filters?.to) rows = rows.filter((row) => row.createdAt.slice(0, 10) <= filters.to!);
  return rows;
}

export const api = {
  async signIn(email: string, password: string, role: "AUTHOR" | "ADMIN") {
    const result = await request<{ token: string; user: BackendUser }>("/auth/login", {
      method: "POST", body: JSON.stringify({ email, password }),
    });
    const user = mapUser(result.user);
    if (user.role !== role) throw new ApiError("FORBIDDEN", "Wrong account type", 403);
    localStorage.setItem(TOKEN_KEY, result.token);
    return user;
  },
  async signUp(name: string, email: string, password: string) {
    await request("/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) });
    return api.signIn(email, password, "AUTHOR");
  },
  async signOut() {
    try {
      await request("/auth/logout", { method: "POST" });
    } catch {
      // Ignore network errors if already disconnected or expired
    } finally {
      localStorage.removeItem(TOKEN_KEY);
    }
  },
  async forgotPassword(email: string) {
    return request<{ message: string; devResetLink?: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },
  async resetPassword(token: string, password: string) {
    return request<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
  },
  async me(): Promise<Me | null> {
    if (!localStorage.getItem(TOKEN_KEY)) return null;
    try {
      const result = await request<{ user: BackendUser }>("/auth/me");
      return mapUser(result.user);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        return null;
      }
      throw error;
    }
  },
  async authorSummary(): Promise<AuthorSummary> {
    const result = await request<{ author: { authorId: string; name: string; email: string }; books: Array<{ royaltyPending: string | number }> }>("/author/dashboard");
    return {
      id: 0, name: result.author.name, email: result.author.email,
      royaltyPendingTotal: result.books.reduce((total, book) => total + Number(book.royaltyPending), 0),
      nextPayoutDeadline: new Date().toISOString(), minimumPayout: 1000,
    };
  },
  async books(): Promise<Book[]> {
    const result = await request<{ books: Array<Record<string, unknown>> }>("/author/dashboard");
    return result.books.map((book) => ({
      id: Number(book.id), title: String(book.title), isbn: String(book.isbn ?? ""),
      genre: String(book.genre ?? ""), publicationDate: book.publicationDate ? String(book.publicationDate) : null,
      status: String(book.status), copiesSold: Number(book.totalCopiesSold ?? 0),
      mrp: Number(book.mrp ?? 0), royaltyEarned: Number(book.totalRoyaltyEarned ?? 0),
      royaltyPaid: Number(book.royaltyPaid ?? 0), royaltyPending: Number(book.royaltyPending ?? 0),
      platforms: Array.isArray(book.availableOn) ? book.availableOn.map(String) : [],
    }));
  },
  async myTickets(): Promise<TicketListItem[]> {
    return (await loadTickets()).map(({ messages: _messages, description: _description, author: _author, ...ticket }) => ticket);
  },
  async authorTicket(id: number) {
    const result = await request<{ ticket: BackendTicket }>(`/tickets/${id}`);
    return mapTicket(result.ticket);


  },
  async createTicket(input: {
    subject: string;
    description: string;
    bookTitle?: string;
    category?: Category;
    file?: File | null;
  }) {
    const books = input.bookTitle ? await api.books() : [];
    const bookId = books.find((book) => book.title === input.bookTitle)?.id;
    let body: BodyInit;
    if (input.file) {
      const formData = new FormData();
      formData.append("subject", input.subject);
      formData.append("description", input.description);
      if (input.category) formData.append("category", input.category);
      if (bookId) formData.append("bookId", String(bookId));
      formData.append("file", input.file);
      body = formData;
    } else {
      body = JSON.stringify({
        subject: input.subject,
        description: input.description,
        ...(input.category ? { category: input.category } : {}),
        ...(bookId ? { bookId } : {}),
      });
    }
    const result = await request<{ ticket: BackendTicket }>("/tickets", {
      method: "POST",
      body,
    });
    const created = (await loadTickets()).find((ticket) => ticket.id === result.ticket.id);
    if (!created) throw new ApiError("API_ERROR", "Created ticket could not be loaded", 502);
    return created;
  },
  async authorReply(id: number, body: string, file?: File | null) {
    if (file) {
      const formData = new FormData();
      formData.append("content", body);
      formData.append("file", file);
      await request(`/tickets/${id}/messages`, { method: "POST", body: formData });
    } else {
      await request(`/tickets/${id}/messages`, { method: "POST", body: JSON.stringify({ content: body }) });
    }
  },
  async dashboard(): Promise<DashboardCounts> {
    const rows = await loadTickets();
    const open = rows.filter((row) => row.status === "OPEN" || row.status === "IN_PROGRESS");
    return {
      open: open.length, critical: open.filter((row) => row.priority === "CRITICAL").length,
      overdue: open.filter((row) => row.overdue).length, awaitingClassification: rows.filter((row) => row.aiState === "PENDING").length,
      unassigned: open.filter((row) => !row.assignedAdminName).length,
    };
  },
  async queue(filters: QueueFilters): Promise<TicketListItem[]> {
    return (await loadTickets(filters)).map(({ messages: _messages, description: _description, author: _author, ...ticket }) => ticket);
  },
  async adminTicket(id: number) {
    const result = await request<{ ticket: BackendTicket }>(`/tickets/${id}`);
    return mapTicket(result.ticket);


  },
  async updateTicket(id: number, patch: {
    status?: TicketStatus;
    expectedStatus?: TicketStatus;
    reason?: string;
    category?: Category;
    expectedCategory?: Category;
    priority?: Priority;
    expectedPriority?: Priority;
    useAiSuggestion?: boolean;
    assignToMe?: boolean;
  }) {
    if (patch.status) {
      await request(`/tickets/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: patch.status,
          expectedStatus: patch.expectedStatus,
          reason: patch.reason,
        }),
      });
    }
    if (patch.category && patch.expectedCategory) {
      await request(`/tickets/${id}/category`, {
        method: "PATCH",
        body: JSON.stringify({
          category: patch.category,
          expectedCategory: patch.expectedCategory,
        }),
      });
    }
    if (patch.expectedPriority && (patch.priority || patch.useAiSuggestion)) {
      await request(`/tickets/${id}/priority`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(patch.priority ? { priority: patch.priority } : {}),
          expectedPriority: patch.expectedPriority,
          ...(patch.useAiSuggestion ? { useAiSuggestion: true } : {}),
        }),
      });
    }
    if (patch.assignToMe) await request(`/tickets/${id}/assignment`, { method: "PATCH", body: "{}" });
  },
  async notes(id: number): Promise<InternalNote[]> {
    const result = await request<{ notes: Array<{ id: number; content: string; createdAt: string; admin: { email: string; author: { name: string } | null } }> }>(`/tickets/${id}/notes`);
    return result.notes.map((note) => ({ id: note.id, body: note.content, createdAt: note.createdAt, adminName: note.admin.author?.name ?? note.admin.email }));
  },
  async authorBooks(id: number): Promise<AuthorBookSummary[]> {
    const result = await request<{ books: AuthorBookSummary[] }>(`/tickets/${id}/author-books`);
    return result.books;
  },
  async addNote(id: number, body: string) {
    await request(`/tickets/${id}/notes`, { method: "POST", body: JSON.stringify({ content: body }) });
  },
  async aiDraft(id: number, regenerate = false): Promise<AiDraft> {
    return await request<AiDraft>(`/tickets/${id}/draft`, {
      method: "POST",
      body: JSON.stringify({ regenerate }),
    });
  },
  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    const result = await request<{ message: string; token?: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (result.token) {
      localStorage.setItem(TOKEN_KEY, result.token);
    }
    return { message: result.message };
  },
  async sendReply(id: number, body: string, file?: File | null) {
    if (file) {
      const formData = new FormData();
      formData.append("content", body);
      formData.append("file", file);
      await request(`/tickets/${id}/messages`, { method: "POST", body: formData });
    } else {
      await request(`/tickets/${id}/messages`, { method: "POST", body: JSON.stringify({ content: body }) });
    }
  },
};

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CheckCircle2, Copy, History, Mail, MapPin, Phone } from "lucide-react";
import { api } from "../../api/client";
import type { Category, Priority, TicketStatus } from "../../api/types";
import { Card, ErrorBox, LoadingRows, StatusBadge } from "../../components/ui";
import { Thread } from "../../components/Thread";
import { PriorityControl } from "../../components/PriorityControl";
import { ReplyComposer } from "../../components/ReplyComposer";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useAuth } from "../../lib/auth";
import {
  categoryLabel,
  categoryOptions,
  dateShort,
  priorityLabel,
  statusLabel,
  statusOptions,
  timeAgo,
} from "../../lib/labels";

const ALLOWED_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["OPEN", "RESOLVED", "CLOSED"],
  RESOLVED: ["IN_PROGRESS", "OPEN", "CLOSED"],
  CLOSED: [],
};

interface PendingChange {
  title: string;
  body: string;
  confirmLabel: string;
  isReopening?: boolean;
  apply: (reason?: string) => void;
}

function formatRupees(amount?: number | string | null): string {
  if (amount == null) return "₹0.00";
  const num = typeof amount === "number" ? amount : parseFloat(amount);
  if (isNaN(num)) return "₹0.00";
  return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdminTicketPage() {
  const { id } = useParams();
  const ticketId = Number(id);
  const { me } = useAuth();
  const qc = useQueryClient();
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditTab, setAuditTab] = useState<"status" | "classification">("status");
  const [copiedBook, setCopiedBook] = useState<string | null>(null);
  const [showAllBooks, setShowAllBooks] = useState(false);

  const allBooksQuery = useQuery({
    queryKey: ["author-books", ticketId],
    queryFn: () => api.authorBooks(ticketId),
    enabled: showAllBooks && Number.isFinite(ticketId),
    staleTime: 60_000,
  });

  const handleCopyBookTitle = (title: string) => {
    navigator.clipboard.writeText(title);
    setCopiedBook(title);
    setTimeout(() => setCopiedBook(null), 2000);
  };

  const ticket = useQuery({
    queryKey: ["ticket", "admin", ticketId],
    queryFn: () => api.adminTicket(ticketId),
    enabled: Number.isFinite(ticketId),
    retry: false,
    refetchInterval: (query) => (query.state.error ? false : 15_000),
    refetchIntervalInBackground: false,
  });

  // A draft answers the author's latest message. A new author message gets a new draft,
  // and once the team has replied to that message, no draft is offered.
  const messages = ticket.data?.messages ?? [];
  const lastMessage = messages[messages.length - 1];
  const lastIsAdmin = !!lastMessage && lastMessage.isAdmin;
  const latestAuthorMessage = [...messages].reverse().find((m) => !m.isAdmin);
  const latestAuthorId = latestAuthorMessage?.id ?? 0;
  const isClosed = ticket.data?.status === "CLOSED";
  const needsDraft = !isClosed && !lastIsAdmin;

  const draft = useQuery({
    queryKey: ["draft", ticketId, latestAuthorId],
    queryFn: () => api.aiDraft(ticketId),
    enabled: Number.isFinite(ticketId) && needsDraft && !!ticket.data,
    retry: false,
    staleTime: Infinity,
  });

  const update = useMutation({
    mutationFn: (patch: Parameters<typeof api.updateTicket>[1]) => api.updateTicket(ticketId, patch),
    onSuccess: () => {
      setPending(null);
      setReopenReason("");
      setErrorMessage(null);
      setToast("Changes saved successfully.");
      setTimeout(() => setToast(null), 3500);
      qc.invalidateQueries({ queryKey: ["ticket", "admin", ticketId] });
      qc.invalidateQueries({ queryKey: ["queue"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: any) => {
      setErrorMessage(err.message || "That change did not save. Nothing was changed. Try again.");
    },
  });

  if (ticket.isLoading) return <LoadingRows rows={3} />;
  if (ticket.isError && !ticket.data) return <ErrorBox message="This ticket could not be found." />;
  const t = ticket.data;
  if (!t) return null;

  const totalBooks = t.author.totalBooks ?? t.author.books?.length ?? 0;
  const displayedBooks = showAllBooks
    ? (allBooksQuery.data ?? t.author.books ?? [])
    : (t.author.books ?? []);

  const assignedToMe = t.assignedAdminName === me?.email || t.assignedAdminName === me?.name;
  const categoryNote =
    t.categorySource === "ADMIN"
      ? "You changed this"
      : t.aiCategory
        ? `Suggested by AI: ${categoryLabel[t.aiCategory]}`
        : t.aiState === "UNAVAILABLE"
          ? "AI unavailable. Set it by hand."
          : "Waiting for a suggestion";

  // Every change asks first. Nothing is saved until the admin confirms.
  const askStatus = (next: TicketStatus) => {
    if (next === t.status) return;
    setErrorMessage(null);

    const isReopening = t.status === "RESOLVED" && (next === "OPEN" || next === "IN_PROGRESS");
    if (isReopening) {
      setReopenReason("");
      setPending({
        title: "Reopen this ticket?",
        body: `Reopening a resolved ticket requires a short reason for the audit log. The author will see this ticket return to ${statusLabel[next]}.`,
        confirmLabel: "Reopen ticket",
        isReopening: true,
        apply: (reason?: string) => {
          update.mutate({
            status: next,
            expectedStatus: t.status,
            reason: reason ?? reopenReason.trim(),
          });
        },
      });
    } else {
      setPending({
        title: "Change the status?",
        body: `The status will change from ${statusLabel[t.status]} to ${statusLabel[next]}. The author sees the new status on their ticket.`,
        confirmLabel: "Change status",
        isReopening: false,
        apply: () => {
          update.mutate({
            status: next,
            expectedStatus: t.status,
          });
        },
      });
    }
  };

  const askPriority = (next: Priority) => {
    if (next === t.priority) return;
    setErrorMessage(null);
    setPending({
      title: "Change the priority?",
      body: `The priority will change from ${priorityLabel[t.priority]} to ${priorityLabel[next]}. The change is recorded as yours.`,
      confirmLabel: "Change priority",
      apply: () => update.mutate({ priority: next, expectedPriority: t.priority }),
    });
  };

  const askUseAiPriority = () => {
    if (!t.aiPriority || t.priority === t.aiPriority) return;
    setErrorMessage(null);
    setPending({
      title: "Use AI's suggested priority?",
      body: `The priority will change from ${priorityLabel[t.priority]} to ${priorityLabel[t.aiPriority]} (suggested by AI). The change is recorded as yours.`,
      confirmLabel: "Use suggestion",
      apply: () => update.mutate({ useAiSuggestion: true, expectedPriority: t.priority }),
    });
  };

  const askCategory = (next: Category) => {
    if (next === t.category) return;
    setErrorMessage(null);
    setPending({
      title: "Change the category?",
      body: `The category will change from ${categoryLabel[t.category]} to ${categoryLabel[next]}. The change is recorded as yours.`,
      confirmLabel: "Change category",
      apply: () => update.mutate({ category: next, expectedCategory: t.category }),
    });
  };

  return (
    <>
      <Link to="/admin/queue" className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Ticket queue
      </Link>

      <header className="mb-8">
        <p className="text-s text-muted">
          #{t.id} · {t.authorName}
          {t.bookTitle ? ` · ${t.bookTitle}` : " · General"} · Opened {dateShort(t.createdAt)}
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold leading-snug">{t.subject}</h1>
      </header>

      {toast && (
        <div role="status" className="mb-6 flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 transition-all">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
          <span>{toast}</span>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6">
          <ErrorBox message={errorMessage} />
        </div>
      )}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Left Column: Sticky Chat Pane */}
        <div className="flex flex-col min-h-[480px] xl:sticky xl:top-6 xl:h-[calc(100vh-3.5rem)]">
          <div className="card flex flex-1 flex-col min-h-0 overflow-hidden shadow-xs">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5 bg-surface/80 shrink-0">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
                <h2 className="text-sm font-semibold text-ink">Conversation</h2>
              </div>
              <span className="text-xs text-muted">
                {t.messages?.length ?? 0} {t.messages?.length === 1 ? "message" : "messages"}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <Thread messages={t.messages} viewer="ADMIN" authorName={t.authorName} />
            </div>
          </div>

          <ReplyComposer
            key={`${t.id}-${latestAuthorId}`}
            ticketId={t.id}
            draft={needsDraft ? draft.data : undefined}
            draftLoading={needsDraft && draft.isLoading}
            draftFailed={needsDraft && draft.isError}
            noDraft={!needsDraft}
            locked={t.status === "CLOSED"}
          />
        </div>

        <aside className="space-y-5">
          {/* Card 1: Category on top, Priority directly beneath */}
          <Card
            title="Category and priority"
            action={
              <div className="flex items-center gap-2">
                {(t.fieldAudits?.length ?? 0) >= 3 && (
                  <button
                    type="button"
                    onClick={() => {
                      setAuditTab("classification");
                      setShowAuditModal(true);
                    }}
                    className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100 transition"
                    title="View classification change history"
                  >
                    Category/priority changed {t.fieldAudits!.length} times
                  </button>
                )}
                {(t.fieldAudits?.length ?? 0) > 0 && (t.fieldAudits?.length ?? 0) < 3 && (
                  <button
                    type="button"
                    onClick={() => {
                      setAuditTab("classification");
                      setShowAuditModal(true);
                    }}
                    className="text-[11px] text-muted hover:text-ink hover:underline"
                  >
                    History ({t.fieldAudits!.length})
                  </button>
                )}
              </div>
            }
          >
            <div className="space-y-5">
              <div>
                <label htmlFor="category" className="mb-1.5 block text-xs font-medium text-muted">Category</label>
                <select
                  id="category"
                  aria-label="Category"
                  className="field"
                  value={t.category}
                  disabled={update.isPending || t.status === "CLOSED"}
                  onChange={(e) => askCategory(e.target.value as Category)}
                >
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>{categoryLabel[c]}</option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-muted">{categoryNote}</p>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs font-medium text-muted">Priority</p>
                  {t.aiPriority && t.priority !== t.aiPriority && (
                    <button
                      type="button"
                      disabled={update.isPending || t.status === "CLOSED"}
                      onClick={askUseAiPriority}
                      className="text-xs font-medium text-accent hover:underline disabled:opacity-40"
                    >
                      Use AI suggestion ({priorityLabel[t.aiPriority]})
                    </button>
                  )}
                </div>
                <PriorityControl
                  value={t.priority}
                  overridden={t.prioritySource === "ADMIN"}
                  disabled={update.isPending || t.status === "CLOSED"}
                  onChange={askPriority}
                />
                {t.priorityReason && (
                  <p className="mt-1.5 text-xs text-muted leading-relaxed">
                    {t.priorityReason}
                  </p>
                )}
                {(t.royaltyOverdueDays ?? 0) > 0 && (
                  <p className="mt-1 text-xs font-semibold text-critical">
                    Royalty payout overdue by {t.royaltyOverdueDays} days
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* Card 2: Status & Assignment */}
          <Card title="Status and assignment">
            <div className="space-y-4 text-sm">
              <div>
                <label htmlFor="status" className="mb-1.5 block text-xs font-medium text-muted">Status</label>
                <select
                  id="status"
                  className="field"
                  value={t.status}
                  disabled={update.isPending || t.status === "CLOSED"}
                  onChange={(e) => askStatus(e.target.value as TicketStatus)}
                >
                  {statusOptions.map((s) => {
                    const isCurrent = s === t.status;
                    const isAllowed = isCurrent || (ALLOWED_STATUS_TRANSITIONS[t.status]?.includes(s) ?? false);
                    return (
                      <option key={s} value={s} disabled={!isAllowed}>
                        {statusLabel[s]} {!isAllowed ? "(not allowed)" : ""}
                      </option>
                    );
                  })}
                </select>
                {t.status === "CLOSED" && (
                  <p className="mt-1.5 text-xs text-muted">Closed tickets cannot be modified.</p>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-muted">Current status</span>
                <StatusBadge value={t.status} />
              </div>

              <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/50">
                <span className="text-muted">Assigned to</span>
                <div className="flex items-center gap-2">
                  <span>{t.assignedAdminName ?? "Nobody yet"}</span>
                  {!assignedToMe && (
                    <button
                      type="button"
                      className="text-xs font-medium text-accent hover:underline disabled:opacity-40"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ assignToMe: true })}
                    >
                      Assign to me
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/50">
                <span className="text-muted">Last activity</span>
                <span>{timeAgo(t.updatedAt)}</span>
              </div>

              <div className="pt-2 border-t border-border/50">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-canvas transition"
                  onClick={() => setShowAuditModal(true)}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" aria-hidden /> View audit logs
                  </span>
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                    {t.statusAudits?.length ?? 0}
                  </span>
                </button>
              </div>
            </div>
          </Card>

          {/* Card 3: Author & Books Catalog */}
          <Card
            title="Author & Catalog"
            action={
              totalBooks > 0 ? (
                <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
                  {totalBooks} {totalBooks === 1 ? "book" : "books"}
                </span>
              ) : null
            }
          >
            {/* Author Contact Info */}
            <div className="space-y-2 border-b border-border/50 pb-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-ink">{t.author.name}</span>
                {t.author.authorId && (
                  <span className="font-mono text-[11px] text-muted bg-surface px-1.5 py-0.5 rounded border border-border/50">
                    {t.author.authorId}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-muted">
                <Mail className="h-3.5 w-3.5 shrink-0 text-subtle" />
                <a href={`mailto:${t.author.email}`} className="hover:text-accent hover:underline truncate">
                  {t.author.email}
                </a>
              </div>
              {t.author.phone && (
                <div className="flex items-center gap-1.5 text-muted">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-subtle" />
                  <span>{t.author.phone}</span>
                </div>
              )}
              {t.author.city && (
                <div className="flex items-center gap-1.5 text-muted">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-subtle" />
                  <span>{t.author.city}</span>
                </div>
              )}
            </div>

            {/* Books List */}
            <div className="pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {showAllBooks ? `All Books (${displayedBooks.length})` : "Latest Book"}
                </h3>
                {totalBooks > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowAllBooks(!showAllBooks)}
                    disabled={allBooksQuery.isLoading}
                    className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                  >
                    {allBooksQuery.isLoading
                      ? "Loading…"
                      : showAllBooks
                      ? "Show latest only"
                      : `View all (${totalBooks})`}
                  </button>
                )}
              </div>

              {allBooksQuery.isLoading && showAllBooks && (
                <div className="py-4 text-center text-xs text-muted animate-pulse">
                  Loading full catalog ({totalBooks} books)…
                </div>
              )}

              {(!displayedBooks || displayedBooks.length === 0) ? (
                <p className="text-xs text-muted italic py-1">
                  No books linked to this author profile.
                </p>
              ) : (
                <div className="space-y-3">
                  {displayedBooks.map((book) => {
                    const isTicketBook =
                      (t.bookTitle && book.title.trim().toLowerCase() === t.bookTitle.trim().toLowerCase()) ||
                      (t.book?.id && book.id === t.book.id);
                    const pendingAmount = Number(book.royaltyPending || 0);
                    const paidAmount = Number(book.royaltyPaid || 0);

                    return (
                      <div
                        key={book.id || book.bookId}
                        className={`rounded-lg border p-3 text-xs transition ${
                          isTicketBook
                            ? "border-accent/50 bg-accent/5 shadow-xs"
                            : "border-border/60 bg-surface/40 hover:border-border"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-ink text-[13px] leading-snug">
                                {book.title}
                              </span>
                              {isTicketBook && (
                                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                  This ticket
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-[11px] text-muted">
                                ISBN: {book.isbn || "Pending"}
                              </span>
                              {book.status && (
                                <span className="font-sans font-medium uppercase text-[10px] tracking-wide text-ink/70 bg-line/60 px-1.5 py-0.5 rounded">
                                  {book.status}
                                </span>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleCopyBookTitle(book.title)}
                            className="shrink-0 p-1.5 rounded hover:bg-canvas text-muted hover:text-ink transition"
                            title="Copy book title to clipboard"
                          >
                            {copiedBook === book.title ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>

                        {/* Royalty & Sales Details */}
                        <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-border/40 pt-2 text-[11px]">
                          <div>
                            <span className="text-muted block text-[10px]">Pending Royalty</span>
                            <span
                              className={`font-semibold ${
                                pendingAmount > 0 ? "text-amber-600 dark:text-amber-400" : "text-ink"
                              }`}
                            >
                              {formatRupees(pendingAmount)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted block text-[10px]">Total Paid</span>
                            <span className="font-medium text-ink">{formatRupees(paidAmount)}</span>
                          </div>
                          {book.totalCopiesSold !== undefined && (
                            <div>
                              <span className="text-muted block text-[10px]">Copies Sold</span>
                              <span className="font-medium text-ink">{book.totalCopiesSold} units</span>
                            </div>
                          )}
                          {book.lastRoyaltyPayoutDate && (
                            <div>
                              <span className="text-muted block text-[10px]">Last Payout</span>
                              <span className="font-medium text-ink">
                                {dateShort(book.lastRoyaltyPayoutDate)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {!showAllBooks && totalBooks > 1 && (
                    <button
                      type="button"
                      onClick={() => setShowAllBooks(true)}
                      disabled={allBooksQuery.isLoading}
                      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-accent hover:bg-canvas transition disabled:opacity-50"
                    >
                      {allBooksQuery.isLoading
                        ? "Loading books…"
                        : `View all ${totalBooks} books`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </Card>
        </aside>
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.title ?? ""}
        body={pending?.body ?? ""}
        confirmLabel={pending?.confirmLabel ?? "Confirm"}
        busy={update.isPending}
        disabled={pending?.isReopening ? reopenReason.trim().length < 10 : false}
        onConfirm={() => pending?.apply(reopenReason.trim())}
        onCancel={() => {
          setPending(null);
          setReopenReason("");
        }}
      >
        {pending?.isReopening && (
          <div className="mt-3">
            <label htmlFor="reopen-reason" className="mb-1.5 block text-xs font-medium text-ink">
              Reason for reopening <span className="text-danger">*</span> (min 10 characters)
            </label>
            <textarea
              id="reopen-reason"
              rows={3}
              className="field w-full text-sm"
              placeholder="e.g. Author provided the updated files, investigating further."
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              autoFocus
            />
            <div className="mt-1 flex justify-between text-xs text-muted">
              <span>{reopenReason.trim().length >= 10 ? "✓ Minimum length met" : "Required to reopen"}</span>
              <span>{reopenReason.trim().length}/10 min chars</span>
            </div>
          </div>
        )}
      </ConfirmDialog>
      {/* View Audit Logs Modal */}
      {showAuditModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4"
          onMouseDown={() => setShowAuditModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-modal-title"
            className="w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl max-h-[80vh] flex flex-col"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-accent" aria-hidden />
                <h2 id="audit-modal-title" className="text-lg font-semibold">
                  Ticket Audit History
                </h2>
              </div>
              <button
                type="button"
                className="btn-ghost !p-1.5 text-muted hover:text-ink text-sm"
                onClick={() => setShowAuditModal(false)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            {/* Segmented Tab Switcher */}
            <div className="mt-3 flex border-b border-border text-xs font-medium">
              <button
                type="button"
                onClick={() => setAuditTab("status")}
                className={`px-3 py-2 border-b-2 transition -mb-px ${
                  auditTab === "status"
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                Status changes ({t.statusAudits?.length ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setAuditTab("classification")}
                className={`px-3 py-2 border-b-2 transition -mb-px ${
                  auditTab === "classification"
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                Category & Priority ({t.fieldAudits?.length ?? 0})
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto space-y-3 pr-1">
              {auditTab === "status" ? (
                !t.statusAudits || t.statusAudits.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted">
                    No status changes recorded yet for this ticket.
                  </p>
                ) : (
                  t.statusAudits.map((audit) => (
                    <div
                      key={audit.id}
                      className="rounded-lg border border-border/70 bg-canvas/60 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between font-medium">
                        <span className="text-sm font-semibold text-ink">
                          {statusLabel[audit.fromStatus]} &rarr; {statusLabel[audit.toStatus]}
                        </span>
                        <span className="text-muted">{timeAgo(audit.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-muted">
                        Changed by <strong className="font-medium text-ink">{audit.admin.author?.name || audit.admin.email}</strong> on {dateShort(audit.createdAt)}
                      </p>
                      {audit.reason && (
                        <div className="mt-2 rounded bg-surface p-2 text-ink border border-border/50">
                          <span className="font-medium text-muted block mb-0.5">Reopen Reason:</span>
                          <p className="italic">&ldquo;{audit.reason}&rdquo;</p>
                        </div>
                      )}
                    </div>
                  ))
                )
              ) : (
                !t.fieldAudits || t.fieldAudits.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted">
                    No category or priority changes recorded yet for this ticket.
                  </p>
                ) : (
                  t.fieldAudits.map((audit) => {
                    const fromLabel =
                      audit.field === "CATEGORY"
                        ? categoryLabel[audit.fromValue as Category] ?? audit.fromValue
                        : priorityLabel[audit.fromValue as Priority] ?? audit.fromValue;
                    const toLabel =
                      audit.field === "CATEGORY"
                        ? categoryLabel[audit.toValue as Category] ?? audit.toValue
                        : priorityLabel[audit.toValue as Priority] ?? audit.toValue;
                    return (
                      <div
                        key={audit.id}
                        className="rounded-lg border border-border/70 bg-canvas/60 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between font-medium">
                          <span className="text-sm font-semibold text-ink">
                            <span className="text-muted font-normal text-xs uppercase tracking-wider mr-1.5">
                              {audit.field}:
                            </span>
                            {fromLabel} &rarr; {toLabel}
                          </span>
                          <span className="text-muted">{timeAgo(audit.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-muted">
                          Changed by <strong className="font-medium text-ink">{audit.admin.author?.name || audit.admin.email}</strong> on {dateShort(audit.createdAt)}
                        </p>
                      </div>
                    );
                  })
                )
              )}
            </div>

            <div className="mt-5 flex justify-end border-t border-border pt-3">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowAuditModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

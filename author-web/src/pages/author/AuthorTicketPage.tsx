import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Image as ImageIcon, Paperclip, Send, X } from "lucide-react";
import { api } from "../../api/client";
import { Card, EmptyState, ErrorBox, LoadingRows, StatusBadge } from "../../components/ui";
import { Thread } from "../../components/Thread";
import { progressSteps, progressStage } from "../../lib/progress";
import { categoryLabel, dateShort, timeAgo } from "../../lib/labels";
import { useAuth } from "../../lib/auth";

export default function AuthorTicketPage() {
  const { id } = useParams();
  const ticketId = Number(id);
  const { me } = useAuth();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Opening a different ticket must not carry over an unsent reply or file.
  useEffect(() => {
    setReply("");
    setFile(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [ticketId]);

  // Near real-time: the thread refreshes every 10 seconds while visible.
  const q = useQuery({
    queryKey: ["ticket", "author", ticketId],
    queryFn: async () => {
      const data = await api.authorTicket(ticketId);
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
      return data;
    },
    enabled: Number.isFinite(ticketId),
    retry: false,
    refetchInterval: (query) =>
      query.state.error || query.state.data?.status === "CLOSED" ? false : 15_000,
    refetchIntervalInBackground: false,
  });

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const chosen = e.target.files?.[0];
    if (!chosen) return;
    if (chosen.size > 5 * 1024 * 1024) {
      setFileError("Files must be 5MB or less.");
      return;
    }
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(chosen.type)) {
      setFileError("Only images (JPG, PNG, WebP) and PDF documents are allowed.");
      return;
    }
    setFile(chosen);
  };

  const removeFile = () => {
    setFile(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const send = useMutation({
    mutationFn: (variables: { body: string; file?: File | null }) =>
      api.authorReply(ticketId, variables.body, variables.file ?? undefined),
    onSuccess: () => {
      setReply("");
      removeFile();
      qc.invalidateQueries({ queryKey: ["ticket", "author", ticketId] });
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
    },
  });

  if (q.isLoading) return <LoadingRows rows={2} />;
  if (q.isError && !q.data) {
    return <EmptyState title="We could not find that ticket" body="It may not exist, or it may not be linked to your account." action={<Link to="/tickets" className="btn-ghost">Back to my tickets</Link>} />;
  }
  const t = q.data;
  if (!t || !me) return null;

  const stage = progressStage(t);
  const replyLocked = t.status === "CLOSED";
  const canSubmit = (reply.trim().length > 0 || file !== null) && !send.isPending && !replyLocked;

  return (
    <>
      <Link to="/tickets" className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> My tickets
      </Link>

      <header className="mb-6">
        <p className="text-s text-muted">#{t.id} · {t.bookTitle ?? "General"} · Opened {dateShort(t.createdAt)}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{t.subject}</h1>
          <StatusBadge value={t.status} />
        </div>
      </header>

      <ol className="mb-8 grid grid-cols-4 gap-2" aria-label="Progress">
        {progressSteps.map((s, i) => (
          <li key={s} className="space-y-2">
            <div className={`h-1 rounded-full ${i <= stage ? "bg-accent" : "bg-line"}`} />
            <p className={`text-xs ${i <= stage ? "font-medium text-ink" : "text-subtle"}`}>{s}</p>
          </li>
        ))}
      </ol>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-h-[420px] flex-col">
          <div className="flex-1 space-y-6">
            <Card>
              <Thread messages={t.messages} viewer="AUTHOR" authorName={me.name} />
            </Card>
            {q.isError && <ErrorBox message="Live updates have paused. Refresh the page to see the latest." />}
          </div>

          <div className="sticky bottom-4 mt-6">
            {/* Selected file preview pill */}
            {file && (
              <div className="mb-2 flex items-center gap-2 rounded-xl bg-surface border border-border px-3 py-1.5 text-xs text-ink w-fit shadow-xs">
                {file.type.startsWith("image/") ? (
                  <ImageIcon className="h-4 w-4 text-accent shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-accent shrink-0" />
                )}
                <span className="font-medium truncate max-w-[220px]">{file.name}</span>
                <span className="text-muted">({(file.size / 1024).toFixed(0)} KB)</span>
                <button
                  type="button"
                  onClick={removeFile}
                  className="ml-1 rounded-md p-0.5 text-muted hover:text-critical transition"
                  title="Remove attachment"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {fileError && <p className="mb-2 text-xs text-critical">{fileError}</p>}

            {/* WhatsApp-style compact chat input bar with paperclip */}
            <form
              className="flex items-end gap-1.5 rounded-2xl border border-border bg-surface p-2 shadow-sm focus-within:border-accent focus-within:ring-1 focus-within:ring-accent transition"
              onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit) {
                  send.mutate({ body: reply.trim(), file });
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                onChange={onFileChange}
                disabled={replyLocked}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-9 w-9 shrink-0 items-center justify-center text-muted hover:text-ink transition mb-0.5 rounded-xl hover:bg-canvas"
                title="Attach photo or PDF (up to 5MB)"
                disabled={replyLocked}
              >
                <Paperclip className="h-4 w-4" />
              </button>

              <label htmlFor="reply" className="sr-only">Your reply</label>
              <textarea
                id="reply"
                rows={1}
                className="flex-1 resize-none border-0 bg-transparent px-2 py-2 text-[15px] text-ink placeholder:text-muted focus:outline-none max-h-32 leading-relaxed"
                placeholder={replyLocked ? "This ticket is closed, so replies are turned off." : "Type a message… (Press Enter to send)"}
                value={reply}
                disabled={replyLocked}
                onChange={(e) => {
                  setReply(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (canSubmit) {
                      send.mutate({ body: reply.trim(), file });
                    }
                  }
                }}
              />
              <button
                type="submit"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed mb-0.5"
                disabled={!canSubmit}
                aria-label="Send reply"
                title="Send reply (Enter)"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            {send.isError && <div className="mt-2"><ErrorBox message="Your reply did not send. The text is still here, so try again." /></div>}
          </div>
        </div>

        <aside className="space-y-4">
          <Card title="Details">
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-xs text-muted">Category</dt>
                <dd className="mt-0.5">{categoryLabel[t.category]}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Last activity</dt>
                <dd className="mt-0.5">{timeAgo(t.updatedAt)}</dd>
              </div>
            </dl>
          </Card>
        </aside>
      </div>
    </>
  );
}

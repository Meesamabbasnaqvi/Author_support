import type { TicketMessage } from "../api/types";
import { timeAgo } from "../lib/labels";
import { Avatar } from "./ui";
import { FileText, Download } from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  messages: TicketMessage[];
  viewer: "AUTHOR" | "ADMIN";
  authorName: string;
}

// Chat layout: the viewer's own messages sit on the right, the other side on the left.
export function Thread({ messages, viewer, authorName }: Props) {
  if (messages.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No messages yet.</p>;
  }

  return (
    <ol className="space-y-5" aria-label="Conversation">
      {messages.map((m) => {
        const mine = viewer === "ADMIN" ? m.isAdmin : !m.isAdmin;
        const name = m.isAdmin ? (viewer === "ADMIN" && m.senderName ? m.senderName : "BookLeaf Support") : authorName;
        const hasAttachments = !!(m.attachments && m.attachments.length > 0);
        const isPlaceholderText = hasAttachments && (m.body === "Attachment" || m.attachments?.some((a) => a.filename === m.body));

        return (
          <li key={m.id} className={`flex gap-3 ${mine ? "flex-row-reverse" : ""}`}>
            <Avatar name={name} size="sm" dark={mine && viewer === "ADMIN"} />
            <div className={`max-w-[78%] ${mine ? "items-end text-right" : ""} flex flex-col`}>
              <p className="mb-1 text-xs text-muted">
                <span className="font-medium text-ink">{mine ? "You" : name}</span> · {timeAgo(m.createdAt)}
              </p>
              <div
                className={`rounded-2xl px-4 py-3 text-left text-[15px] leading-relaxed ${
                  mine ? "rounded-tr-sm bg-accent text-white" : "rounded-tl-sm border border-line bg-canvas text-ink"
                }`}
              >
                {!isPlaceholderText && m.body && (
                  <div className="whitespace-pre-line">{m.body}</div>
                )}

                {hasAttachments && (
                  <div className={`space-y-2 ${!isPlaceholderText && m.body ? "mt-3 pt-2 border-t " + (mine ? "border-white/20" : "border-line") : ""}`}>
                    {m.attachments!.map((att) => {
                      const isImage = att.mimeType.startsWith("image/");
                      return isImage ? (
                        <div key={att.id} className="group overflow-hidden rounded-xl">
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block focus:outline-none"
                            title={`Open ${att.filename}`}
                          >
                            <img
                              src={att.url}
                              alt={att.filename}
                              className="max-h-64 max-w-full rounded-xl object-contain bg-black/5 hover:opacity-95 transition"
                              loading="lazy"
                            />
                            <div className={`mt-1 flex items-center justify-between text-[11px] px-1 ${mine ? "text-white/80" : "text-muted"}`}>
                              <span className="truncate max-w-[180px]">{att.filename}</span>
                              <span>{formatBytes(att.size)}</span>
                            </div>
                          </a>
                        </div>
                      ) : (
                        <a
                          key={att.id}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={att.filename}
                          className={`flex items-center gap-3 rounded-xl p-2.5 text-xs transition ${
                            mine
                              ? "bg-white/15 text-white hover:bg-white/25"
                              : "border border-border bg-surface text-ink hover:bg-canvas"
                          }`}
                          title={`Download ${att.filename}`}
                        >
                          <FileText className={`h-6 w-6 shrink-0 ${mine ? "text-white" : "text-accent"}`} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{att.filename}</p>
                            <p className={`text-[11px] ${mine ? "text-white/80" : "text-muted"}`}>
                              {formatBytes(att.size)} • PDF
                            </p>
                          </div>
                          <Download className="h-4 w-4 shrink-0 opacity-80" />
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

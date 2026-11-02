import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Sparkles, Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { AiDraft } from "../api/types";
import { ErrorBox } from "./ui";

interface Props {
  ticketId: number;
  draft?: AiDraft;
  draftLoading: boolean;
  draftFailed: boolean;
  noDraft: boolean;
  locked: boolean;
}

export function ReplyComposer({ ticketId, draft, draftLoading, locked }: Props) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [seeded, setSeeded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 40), 220)}px`;
  };

  useEffect(() => {
    if (draft && !seeded) {
      setBody(draft.body);
      setSeeded(true);
      requestAnimationFrame(() => {
        resizeTextarea(textareaRef.current);
      });
    }
  }, [draft, seeded]);

  const send = useMutation({
    mutationFn: (text: string) => api.sendReply(ticketId, text),
    onSuccess: () => {
      setBody("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      qc.invalidateQueries({ queryKey: ["ticket", "admin", ticketId] });
      qc.invalidateQueries({ queryKey: ["queue"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const clear = () => {
    setBody("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const hasUnresolvedPlaceholder = /\[ADMIN:/i.test(body);
  const canSubmit = body.trim().length > 0 && !hasUnresolvedPlaceholder && !send.isPending && !locked;

  return (
    <div className="sticky bottom-4 xl:static mt-3.5 shrink-0">
      {draftLoading && (
        <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted animate-pulse">
          <Sparkles className="h-3 w-3 text-accent" aria-hidden /> Drafting reply…
        </p>
      )}

      {hasUnresolvedPlaceholder && (
        <p className="mb-1.5 flex items-center gap-1.5 text-xs text-amber-600 font-medium">
          Resolve all [ADMIN: ...] placeholders before sending.
        </p>
      )}

      <form
        className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-sm focus-within:border-accent focus-within:ring-1 focus-within:ring-accent transition"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) {
            send.mutate(body.trim());
          }
        }}
      >
        <label htmlFor="admin-reply" className="sr-only">Your reply</label>
        <textarea
          ref={textareaRef}
          id="admin-reply"
          rows={1}
          className="flex-1 resize-none border-0 bg-transparent px-3 py-2 text-[15px] text-ink placeholder:text-muted focus:outline-none max-h-56 leading-relaxed"
          placeholder={locked ? "This ticket is closed, so replies are turned off." : "Type a messageâ€¦ (Press Enter to send)"}
          value={body}
          disabled={locked}
          onChange={(e) => {
            setBody(e.target.value);
            resizeTextarea(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSubmit) {
                send.mutate(body.trim());
              }
            }
          }}
        />

        {body.length > 0 && !locked && (
          <button
            type="button"
            onClick={clear}
            className="flex h-9 w-9 shrink-0 items-center justify-center text-muted hover:text-critical transition mb-0.5 rounded-xl hover:bg-canvas"
            title="Clear text"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}

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
      {send.isError && <div className="mt-2"><ErrorBox message="The reply did not send. Your text is still here, so try again." /></div>}
    </div>
  );
}
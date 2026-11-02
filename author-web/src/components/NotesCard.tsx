import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Lock } from "lucide-react";
import { api } from "../api/client";
import { timeAgo } from "../lib/labels";
import { Avatar, Card } from "./ui";

export function NotesCard({ ticketId }: { ticketId: number }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const notes = useQuery({ queryKey: ["notes", ticketId], queryFn: () => api.notes(ticketId) });

  const add = useMutation({
    mutationFn: () => api.addNote(ticketId, text.trim()),
    onSuccess: () => {
      setText("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      qc.invalidateQueries({ queryKey: ["notes", ticketId] });
    },
  });

  return (
    <Card title="Internal notes" action={<span className="flex items-center gap-1 text-xs text-muted"><Lock className="h-3 w-3" aria-hidden /> Team only</span>}>
      <ul className="space-y-4">
        {notes.data?.map((n) => (
          <li key={n.id} className="flex gap-3">
            <Avatar name={n.adminName} size="sm" />
            <div className="min-w-0">
              <p className="text-xs text-muted">
                <span className="font-medium text-ink">{n.adminName}</span> · {timeAgo(n.createdAt)}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed">{n.body}</p>
            </div>
          </li>
        ))}
        {notes.data?.length === 0 && <li className="text-sm text-muted">No notes yet. Add one for the team.</li>}
      </ul>

      <div className="mt-5 border-t border-line pt-4">
        <label htmlFor="note" className="sr-only">Add a note</label>
        <textarea
          id="note"
          rows={2}
          className="field resize-none"
          placeholder="Add a note for the team"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-2 flex items-center justify-between">
          {saved ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Note saved
            </span>
          ) : <span />}
          <button type="button" className="btn-ghost" disabled={text.trim().length < 2 || add.isPending} onClick={() => add.mutate()}>
            {add.isPending ? "Saving…" : "Save note"}
          </button>
        </div>
      </div>
    </Card>
  );
}

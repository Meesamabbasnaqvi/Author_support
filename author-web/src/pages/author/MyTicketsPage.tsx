import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MessageSquarePlus } from "lucide-react";
import { api } from "../../api/client";
import type { TicketListItem } from "../../api/types";
import { EmptyState, ErrorBox, LoadingRows, PageHeader, StatusBadge } from "../../components/ui";
import { timeAgo } from "../../lib/labels";

// Tickets are grouped by what the author needs to do next, not by a status filter.
export default function MyTicketsPage() {
  // Refetches every 45 seconds while tab is visible.
  const q = useQuery({
    queryKey: ["my-tickets"],
    queryFn: () => api.myTickets(),
    refetchInterval: (query) => (query.state.error ? false : 45_000),
    refetchIntervalInBackground: false,
  });

  const all = q.data ?? [];
  const groups: { title: string; hint: string; items: TicketListItem[] }[] = [
    { title: "New replies", hint: "The team has answered these.", items: all.filter((t) => t.hasNewReply) },
    {
      title: "Open",
      hint: "Still being worked on.",
      items: all.filter((t) => !t.hasNewReply && (t.status === "OPEN" || t.status === "IN_PROGRESS")),
    },
    {
      title: "Closed",
      hint: "Resolved or closed.",
      items: all.filter((t) => !t.hasNewReply && (t.status === "RESOLVED" || t.status === "CLOSED")),
    },
  ];

  return (
    <>
      <PageHeader
        title="My tickets"
        lead="Every query you have raised. Replies from the BookLeaf team show up here as they arrive."
        actions={
          <Link to="/tickets/new" className="btn-primary">
            <MessageSquarePlus className="h-4 w-4" aria-hidden /> Raise a query
          </Link>
        }
      />

      {q.isLoading && <LoadingRows rows={4} />}
      {q.isError && !q.data && <ErrorBox message="We could not load your tickets. We will keep trying." />}
      {q.data && all.length === 0 && (
        <EmptyState
          title="No queries yet"
          body="When you have a question about a royalty, a book or a listing, raise a query and we will reply here."
          action={<Link to="/tickets/new" className="btn-primary">Raise your first query</Link>}
        />
      )}

      <div className="space-y-8">
        {groups
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <section key={g.title} aria-labelledby={`grp-${g.title}`}>
              <div className="mb-3 flex items-baseline gap-3">
                <h2 id={`grp-${g.title}`} className="text-base font-semibold">{g.title}</h2>
                <span className="text-sm text-muted">{g.items.length}</span>
                <span className="text-sm text-subtle">· {g.hint}</span>
              </div>
              <ul className="card divide-y divide-line overflow-hidden">
                {g.items.map((t) => (
                  <li key={t.id} className="relative">
                    {t.hasNewReply && <span className="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden />}
                    <Link to={`/tickets/${t.id}`} className="flex items-center gap-4 py-4 pl-6 pr-5 hover:bg-canvas/60">
                      <div className="min-w-0 flex-1">
                        <p className={`truncate ${t.hasNewReply ? "font-semibold" : "font-medium"}`}>{t.subject}</p>
                        <p className="mt-1 text-xs text-muted">
                          #{t.id} · {t.bookTitle ?? "General"} ·{" "}
                          {t.hasNewReply ? <span className="font-medium text-accent">Replied {timeAgo(t.updatedAt)}</span> : `Updated ${timeAgo(t.updatedAt)}`}
                        </p>
                      </div>
                      <StatusBadge value={t.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </>
  );
}

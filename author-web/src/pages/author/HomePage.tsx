import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MessageSquarePlus } from "lucide-react";
import { api } from "../../api/client";
import { Card, EmptyState, ErrorBox, LoadingRows, StatusBadge } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { dateShort, greeting, money, timeAgo } from "../../lib/labels";

export default function HomePage() {
  const { me } = useAuth();
  const summary = useQuery({ queryKey: ["author-summary"], queryFn: () => api.authorSummary() });
  const tickets = useQuery({ queryKey: ["my-tickets"], queryFn: () => api.myTickets(), refetchInterval: (query) => (query.state.error ? false : 45_000) });
  const books = useQuery({ queryKey: ["books"], queryFn: () => api.books() });

  const attention = (tickets.data ?? []).filter((t) => t.hasNewReply || t.status === "OPEN");
  const firstName = me?.name.split(" ")[0] ?? "";

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">
            {greeting()}, {firstName}
          </p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight">Here is where things stand.</h1>
        </div>
        <Link to="/tickets/new" className="btn-primary">
          <MessageSquarePlus className="h-4 w-4" aria-hidden /> Raise a query
        </Link>
      </header>

      {summary.isError && <ErrorBox message="We could not load your royalty summary. It will retry automatically." />}
      {summary.data && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <p className="text-sm text-muted">Royalty pending</p>
            <p className="mt-2 font-serif text-[32px] font-semibold tabular-nums">{money(summary.data.royaltyPendingTotal)}</p>
            <p className="mt-2 text-sm text-muted">Across {books.data?.length ?? 0} titles</p>
          </Card>
          <Card>
            <p className="text-sm text-muted">Next payout</p>
            <p className="mt-2 font-serif text-[32px] font-semibold">{dateShort(summary.data.nextPayoutDeadline)}</p>
            <p className="mt-2 text-sm text-muted">
              Payouts need at least {money(summary.data.minimumPayout)}. Smaller amounts roll over.
            </p>
          </Card>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="attention">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="attention" className="text-base font-semibold">Needs your attention</h2>
            <Link to="/tickets" className="text-sm font-medium text-accent hover:underline">All tickets</Link>
          </div>

          {tickets.isLoading && <LoadingRows rows={3} />}
          {tickets.data && attention.length === 0 && (
            <EmptyState title="Nothing waiting on you" body="When the support team replies, or when you have an open query, it will show here." />
          )}
          {attention.length > 0 && (
            <ul className="card divide-y divide-line">
              {attention.map((t) => (
                <li key={t.id}>
                  <Link to={`/tickets/${t.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-canvas">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate font-medium">
                        {t.hasNewReply && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="New reply" />}
                        {t.subject}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {t.bookTitle ?? "General"} · {timeAgo(t.updatedAt)}
                      </p>
                    </div>
                    <StatusBadge value={t.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="books">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="books" className="text-base font-semibold">Your books</h2>
            <Link to="/books" className="text-sm font-medium text-accent hover:underline">All books</Link>
          </div>
          {books.isLoading && <LoadingRows rows={3} />}
          {books.data && (
            <ul className="card divide-y divide-line">
              {books.data.slice(0, 4).map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{b.title}</p>
                    <p className="text-xs text-muted">{b.status}{b.productionStage ? `, waiting on ${b.productionStage.toLowerCase()}` : ""}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-subtle" aria-hidden />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

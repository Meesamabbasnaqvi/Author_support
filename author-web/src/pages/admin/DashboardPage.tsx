import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { api } from "../../api/client";
import { Card, EmptyState, LoadingRows, PriorityBadge, StatusBadge } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { greeting, timeAgo } from "../../lib/labels";

export default function DashboardPage() {
  const { me } = useAuth();
  const counts = useQuery({ queryKey: ["dashboard"], queryFn: () => api.dashboard(), refetchInterval: 15_000 });
  // The server orders the queue by urgency. The dashboard only shows the top of it.
  const queue = useQuery({
    queryKey: ["queue", "top"],
    queryFn: () => api.queue({ status: "ALL" }),
    refetchInterval: 15_000,
  });
  const open = (queue.data ?? []).filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS").slice(0, 5);

  const tiles = [
    { label: "Open tickets", value: counts.data?.open, to: "/admin/queue?status=OPEN", hint: "Not yet resolved" },
    { label: "Critical", value: counts.data?.critical, to: "/admin/queue?priority=CRITICAL", hint: "Needs a reply first" },
    { label: "Overdue", value: counts.data?.overdue, to: "/admin/queue", hint: "Past the response window" },
    { label: "Awaiting AI", value: counts.data?.awaitingClassification, to: "/admin/queue", hint: "Category not yet suggested" },
  ];

  return (
    <>
      <header className="mb-8">
        <p className="text-sm text-muted">{greeting()}, {me?.name.split(" ")[0]}</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">Here is what needs you today.</h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to} className="card block p-5 transition-colors hover:border-accent/40">
            <p className="text-sm text-muted">{t.label}</p>
            <p className="mt-2 font-serif text-[32px] font-semibold tabular-nums">{t.value ?? "–"}</p>
            <p className="mt-1 text-xs text-subtle">{t.hint}</p>
          </Link>
        ))}
      </div>

      <section className="mt-10" aria-labelledby="urgent">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="urgent" className="text-base font-semibold">Most urgent</h2>
          <Link to="/admin/queue" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
            Open full queue <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        {queue.isLoading && <LoadingRows rows={5} />}
        {queue.data && open.length === 0 && (
          <EmptyState title="The queue is clear" body="New tickets appear here as authors send them." />
        )}
        {open.length > 0 && (
          <Card className="!p-0 overflow-hidden">
            <ul className="divide-y divide-line">
              {open.map((t) => (
                <li key={t.id}>
                  <Link to={`/admin/tickets/${t.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-canvas/60">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t.subject}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        #{t.id} · {t.authorName}
                        {t.bookTitle ? ` · ${t.bookTitle}` : ""} · {timeAgo(t.createdAt)}
                        {t.overdue && <span className="ml-2 font-medium text-critical">Overdue</span>}
                      </p>
                    </div>
                    <div className="hidden sm:block"><PriorityBadge value={t.priority} /></div>
                    <div className="hidden md:block"><StatusBadge value={t.status} /></div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </>
  );
}

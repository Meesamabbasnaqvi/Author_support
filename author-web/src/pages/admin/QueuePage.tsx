import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type QueueFilters } from "../../api/client";
import type { Category, Priority, TicketStatus } from "../../api/types";
import { EmptyState, ErrorBox, LoadingRows, PageHeader, PriorityBadge, StatusBadge } from "../../components/ui";
import { categoryLabel, categoryOptions, dateShort, priorityLabel, priorityOptions, statusLabel, statusOptions, timeAgo } from "../../lib/labels";

// Filters live in the URL, so a filtered view can be bookmarked and shared inside the team.
export default function QueuePage() {
  const [params, setParams] = useSearchParams();

  const filters: QueueFilters = {
    status: (params.get("status") as TicketStatus) || "ALL",
    priority: (params.get("priority") as Priority) || "ALL",
    category: (params.get("category") as Category) || "ALL",
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
  };
  const active = [filters.status !== "ALL", filters.priority !== "ALL", filters.category !== "ALL", !!filters.from, !!filters.to].filter(Boolean).length;

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === "ALL") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  // The queue refreshes every 15 seconds. Order comes from the server.
  const q = useQuery({
    queryKey: ["queue", filters],
    queryFn: () => api.queue(filters),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const rows = q.data ?? [];

  return (
    <>
      <PageHeader
        title="Ticket queue"
        lead="The most urgent and oldest unresolved tickets come first. Every ticket is shared across the support team."
      />

      <div className="card mb-5 p-4" role="search" aria-label="Filter tickets">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Select label="Status" value={filters.status ?? "ALL"} onChange={(v) => setFilter("status", v)}>
            <option value="ALL">All statuses</option>
            {statusOptions.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
          </Select>
          <Select label="Priority" value={filters.priority ?? "ALL"} onChange={(v) => setFilter("priority", v)}>
            <option value="ALL">All priorities</option>
            {priorityOptions.map((p) => <option key={p} value={p}>{priorityLabel[p]}</option>)}
          </Select>
          <Select label="Category" value={filters.category ?? "ALL"} onChange={(v) => setFilter("category", v)}>
            <option value="ALL">All categories</option>
            {categoryOptions.map((c) => <option key={c} value={c}>{categoryLabel[c]}</option>)}
          </Select>
          <DateField label="From" value={filters.from} onChange={(v) => setFilter("from", v)} />
          <DateField label="To" value={filters.to} onChange={(v) => setFilter("to", v)} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <p className="text-muted" aria-live="polite">
            {q.data ? `${rows.length} ${rows.length === 1 ? "ticket" : "tickets"}` : "Loading…"}
            {active > 0 && <span> · {active} {active === 1 ? "filter" : "filters"} applied</span>}
          </p>
          {active > 0 && (
            <button type="button" className="font-medium text-accent hover:underline" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {q.isLoading && <LoadingRows rows={6} />}
      {q.isError && !q.data && <ErrorBox message="The queue could not be loaded. It will retry shortly." />}
      {q.data && rows.length === 0 && (
        <EmptyState
          title="Nothing matches these filters"
          body="Try widening the dates or clearing a filter."
          action={<button className="btn-ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear filters</button>}
        />
      )}

      {rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-5 py-3 font-medium">Ticket</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Assigned</th>
                <th className="px-5 py-3 text-right font-medium">Opened</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((t) => (
                <tr key={t.id} className="group hover:bg-canvas/60">
                  <td className="px-5 py-4">
                    <Link to={`/admin/tickets/${t.id}`} className="font-medium hover:text-accent">{t.subject}</Link>
                    <p className="mt-0.5 text-xs text-muted">
                      #{t.id} · {t.authorName}{t.bookTitle ? ` · ${t.bookTitle}` : ""}
                    </p>
                    {t.overdue && <p className="mt-1 text-xs font-medium text-critical">Overdue</p>}
                  </td>
                  <td className="px-4 py-4">
                    <p>{categoryLabel[t.category]}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {t.categorySource === "ADMIN" ? "Changed by you" : t.aiState === "UNAVAILABLE" ? "Set by hand" : t.aiState === "PENDING" ? "Waiting for AI" : "Suggested by AI"}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <PriorityBadge value={t.priority} />
                    {t.prioritySource === "ADMIN" && <p className="mt-0.5 text-xs text-muted">Changed by you</p>}
                    {t.prioritySource === "RULE" && <p className="mt-0.5 text-xs text-muted">Rule applied</p>}
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge value={t.status} />
                    {t.hasNewReply && <p className="mt-1 text-xs text-muted">Author replied</p>}
                  </td>
                  <td className="px-4 py-4 text-ink">{t.assignedAdminName ?? <span className="text-subtle">Nobody yet</span>}</td>
                  <td className="px-5 py-4 text-right">
                    <p className="tabular-nums">{dateShort(t.createdAt)}</p>
                    <p className="mt-0.5 text-xs text-muted">{timeAgo(t.updatedAt)}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <input type="date" className="field" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

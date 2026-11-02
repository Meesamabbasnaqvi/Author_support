import type { ReactNode } from "react";
import type { Priority, TicketStatus } from "../api/types";
import { priorityDot, priorityLabel, priorityText, statusLabel } from "../lib/labels";

export function PageHeader({ title, lead, actions }: { title: string; lead?: string; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight">{title}</h1>
        {lead && <p className="mt-2 max-w-2xl text-[15px] text-muted">{lead}</p>}
      </div>
      {actions}
    </header>
  );
}

// Dot plus text. Reads at a glance without shouting.
export function PriorityBadge({ value }: { value: Priority }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${priorityText[value]}`}>
      <span className={`h-2 w-2 rounded-full ${priorityDot[value]}`} aria-hidden />
      {priorityLabel[value]}
    </span>
  );
}

// Outlined, no fill. Status is information, not a warning.
export function StatusBadge({ value }: { value: TicketStatus }) {
  const tone =
    value === "RESOLVED"
      ? "border-success/30 text-success"
      : value === "CLOSED"
        ? "border-line text-subtle"
        : value === "IN_PROGRESS"
          ? "border-accent/30 text-accent"
          : "border-line text-ink";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {statusLabel[value]}
    </span>
  );
}

export function Card({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <p className="font-serif text-lg font-semibold">{title}</p>
      <p className="mt-2 max-w-sm text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card divide-y divide-line" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-16 items-center gap-4 px-5">
          <div className="h-3 w-1/3 animate-pulse rounded bg-line" />
          <div className="h-3 w-1/6 animate-pulse rounded bg-line" />
        </div>
      ))}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-critical/25 bg-red-50/60 px-4 py-3 text-sm text-critical">
      {message}
    </div>
  );
}

export function Avatar({ name, dark = false, size = "md" }: { name: string; dark?: boolean; size?: "sm" | "md" }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const dim = size === "sm" ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-xs";
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${dim} ${
        dark ? "bg-slate-700 text-slate-100" : "bg-accent-soft text-accent"
      }`}
    >
      {initials}
    </span>
  );
}

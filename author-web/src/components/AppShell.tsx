import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, ChevronsUpDown, Gauge, Home, Inbox, KeyRound, Lock, LogOut, MessageSquarePlus, Send, Ticket, X } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../lib/auth";
import { initials, timeAgo } from "../lib/labels";
import { Avatar } from "./ui";

export function AppShell({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  if (!me) return null;
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <div className="w-full max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

function Sidebar() {
  const { me } = useAuth();
  const isAdmin = me?.role === "ADMIN";
  const location = useLocation();
  const match = location.pathname.match(/^\/admin\/tickets\/(\d+)$/);
  const activeTicketId = match ? Number(match[1]) : null;

  // Counts shown beside nav items. Authors see tickets with a new reply; admins see open tickets.
  const mine = useQuery({ queryKey: ["my-tickets"], queryFn: () => api.myTickets(), enabled: !isAdmin, refetchInterval: (query) => (query.state.error ? false : 45_000) });
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => api.dashboard(), enabled: isAdmin, refetchInterval: 15_000 });
  const replies = (mine.data ?? []).filter((t) => t.hasNewReply).length;

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-line bg-surface">
      <Link
        to={isAdmin ? "/admin" : "/home"}
        className="flex items-center gap-2.5 px-5 pb-6 pt-6 transition hover:opacity-85"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-serif text-base font-semibold text-white" aria-hidden>
          B
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold">BookLeaf</p>
          <p className="text-xs text-muted">{isAdmin ? "Support team" : "Author support"}</p>
        </div>
      </Link>

      <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3">
        {isAdmin ? (
          <>
            <NavGroup label="Support">
              <NavItem to="/admin" icon={Gauge} end>Dashboard</NavItem>
              <NavItem to="/admin/queue" icon={Inbox} count={dash.data?.open}>Ticket queue</NavItem>
            </NavGroup>
            {activeTicketId && <SidebarNotes ticketId={activeTicketId} />}
          </>
        ) : (
          <>
            <NavGroup label="Your account">
              <NavItem to="/home" icon={Home} end>Home</NavItem>
              <NavItem to="/books" icon={BookOpen}>My books</NavItem>
            </NavGroup>
            <NavGroup label="Support">
              <NavItem to="/tickets" icon={Ticket} count={replies || undefined} countTone="accent">My tickets</NavItem>
              <NavItem to="/tickets/new" icon={MessageSquarePlus}>Raise a query</NavItem>
            </NavGroup>
          </>
        )}
      </nav>

      <ProfileMenu />
    </aside>
  );
}

function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-subtle">{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavItem({
  to,
  icon: Icon,
  children,
  count,
  countTone = "muted",
  end = false,
}: {
  to: string;
  icon: typeof Home;
  children: ReactNode;
  count?: number;
  countTone?: "muted" | "accent";
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${isActive ? "bg-accent-soft font-semibold text-accent" : "text-ink hover:bg-canvas"
        }`
      }
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1">{children}</span>
      {count !== undefined && count > 0 && (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${countTone === "accent" ? "bg-accent text-white" : "bg-canvas text-muted"
            }`}
        >
          {count}
        </span>
      )}
    </NavLink>
  );
}

// Click the name block to open a small panel with the full name, email, role and Sign out.
function ProfileMenu() {
  const { me, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!me) return null;

  const onSignOut = async () => {
    setOpen(false);
    await signOut();
    navigate(me.role === "ADMIN" ? "/support/sign-in" : "/sign-in", { replace: true });
  };

  return (
    <div ref={wrap} className="relative border-t border-line p-3">
      {open && (
        <div role="menu" className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          <div className="border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">{me.name}</p>
            <p className="truncate text-xs text-muted">{me.email}</p>
            <p className="mt-1.5 inline-block rounded bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-muted">
              {me.role === "ADMIN" ? "Support admin" : "Author"}
            </p>
          </div>
          <button
            role="menuitem"
            type="button"
            onClick={() => { setOpen(false); setShowChangePassword(true); }}
            className="flex w-full items-center gap-2 border-b border-line px-4 py-2.5 text-left text-sm text-ink hover:bg-canvas"
          >
            <KeyRound className="h-4 w-4 text-muted" aria-hidden /> Change password
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={onSignOut}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-ink hover:bg-canvas"
          >
            <LogOut className="h-4 w-4 text-muted" aria-hidden /> Sign out
          </button>
        </div>
      )}

      {showChangePassword && (
        <ChangePasswordDialog onClose={() => setShowChangePassword(false)} />
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-canvas"
      >
        <Avatar name={me.name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{me.name}</span>
          <span className="block text-xs text-muted">{me.role === "ADMIN" ? "Support admin" : "Author"}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 text-subtle" aria-hidden />
      </button>
    </div>
  );
}

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const res = await api.changePassword(currentPassword, newPassword);
      setSuccess(res.message);
      setTimeout(() => onClose(), 1800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <h3 className="text-lg font-semibold">Change password</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        {success ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <p className="mt-3 text-sm font-medium text-emerald-800">{success}</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-3.5">
            {error && (
              <p className="rounded-lg border border-critical/30 bg-red-50 px-3 py-2 text-xs text-critical">
                {error}
              </p>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Current password</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="field"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">New password</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="field"
              />
              <span className="text-[11px] text-muted">At least 8 characters</span>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Confirm new password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="field"
              />
            </div>
            <div className="mt-6 flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary" disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? "Updating…" : "Update password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function SidebarNotes({ ticketId }: { ticketId: number }) {
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

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && text.trim().length >= 2 && !add.isPending) {
      e.preventDefault();
      add.mutate();
    }
  };

  return (
    <div className="rounded-xl border border-line bg-canvas/70 p-3 shadow-xs">
      {/* Header */}
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-100 text-amber-800" aria-hidden>
            <Lock className="h-3 w-3" />
          </span>
          <span className="text-xs font-semibold text-ink">Internal Notes</span>
        </div>
        <span className="rounded-full border border-line/60 bg-surface px-2 py-0.5 text-[10px] font-semibold text-muted shadow-xs">
          {notes.data?.length ?? 0}
        </span>
      </div>

      {/* Notes List */}
      <div className="max-h-52 space-y-2 overflow-y-auto pr-0.5">
        {notes.data?.map((n) => (
          <div
            key={n.id}
            className="rounded-lg border border-line/70 bg-surface p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition hover:border-line"
          >
            <div className="mb-1.5 flex items-center justify-between gap-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-semibold text-slate-700">
                  {initials(n.adminName)}
                </span>
                <span className="truncate text-[11px] font-semibold text-ink">{n.adminName}</span>
              </div>
              <span className="shrink-0 text-[10px] text-muted">{timeAgo(n.createdAt)}</span>
            </div>
            <p className="whitespace-pre-line text-[12px] leading-relaxed text-slate-700">{n.body}</p>
          </div>
        ))}
        {notes.data?.length === 0 && (
          <div className="rounded-lg border border-dashed border-line bg-surface/60 p-3 text-center">
            <p className="text-[11px] font-medium text-muted">No notes yet</p>
            <p className="mt-0.5 text-[10px] text-subtle">Visible only to the support team.</p>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="mt-3 border-t border-line/70 pt-2.5">
        <textarea
          rows={2}
          className="w-full resize-none rounded-lg border border-line bg-surface p-2 text-xs text-ink placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="Add team note (Ctrl+Enter)…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="mt-2 flex items-center justify-between">
          {saved ? (
            <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Saved
            </span>
          ) : (
            <span className="text-[10px] text-subtle">Team only</span>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md bg-[#2447A8] px-2.5 py-1 text-xs font-medium text-white shadow-xs transition hover:bg-[#1C3A8A] disabled:opacity-40"
            disabled={text.trim().length < 2 || add.isPending}
            onClick={() => add.mutate()}
          >
            <Send className="h-3 w-3" />
            {add.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

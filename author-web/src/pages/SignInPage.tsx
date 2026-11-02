import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Role } from "../api/types";
import { useAuth } from "../lib/auth";

interface Props {
  role: Role;
}

export default function SignInPage({ role }: Props) {
  const { signIn, me } = useAuth();
  const navigate = useNavigate();
  const isStaff = role === "ADMIN";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.includes("@") || password.length < 8) {
      setError("Enter your email and your password. Passwords are at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const me = await signIn(email, password, role);
      navigate(me.role === "ADMIN" ? "/admin" : "/home", { replace: true });
    } catch (err: unknown) {
      if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError("That email and password don't match. Check them and try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between bg-ink p-12 text-slate-100 lg:flex">
        <Link
          to={me ? (me.role === "ADMIN" ? "/admin" : "/home") : "/"}
          className="flex items-center gap-2.5 transition hover:opacity-85"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white font-serif text-base font-semibold text-ink">B</span>
          <span className="font-semibold">BookLeaf</span>
        </Link>
        <div className="max-w-md">
          <h1 className="font-serif text-4xl leading-tight text-white">
            {isStaff ? "Support, in one place." : "Your questions, answered on the record."}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-400">
            {isStaff
              ? "Work through the queue, draft and send replies, and keep notes the authors never see."
              : "Check your royalties, follow each query, and read every reply from the BookLeaf team in one place."}
          </p>
        </div>
        <p className="text-sm text-slate-500">{isStaff ? "Internal. For the BookLeaf support team." : "Author support portal"}</p>
      </section>

      <section className="flex items-center justify-center p-8">
        <form onSubmit={onSubmit} className="w-full max-w-sm" noValidate>
          <p className="text-sm font-medium text-accent">{isStaff ? "Support team" : "Authors"}</p>
          <h2 className="mt-1 font-serif text-[28px] font-semibold">Sign in</h2>
          <p className="mt-2 text-sm text-muted">
            {isStaff ? "Use your BookLeaf staff email." : "Use the email your BookLeaf account is registered with."}
          </p>

          <div className="mt-8 space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium">Email</label>
              <input id="email" type="email" autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium">Password</label>
                <Link to="/forgot-password" className="text-xs font-medium text-accent hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input id="password" type="password" autoComplete="current-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-critical/25 bg-red-50/60 px-3 py-2 text-sm text-critical">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary mt-6 w-full">
            {busy ? "Signing in…" : "Sign in"}
          </button>

          {!isStaff && (
            <p className="mt-6 text-sm text-muted">
              New to BookLeaf? <Link to="/sign-up" className="font-medium text-accent hover:underline">Create an author account</Link>
            </p>
          )}
          <p className="mt-3 text-sm">
            <Link to="/" className="text-muted hover:text-ink">← Back to start</Link>
          </p>
          {/* comment out below couse - this shows raw from an earlier mock/prototype */}
          {/* <p className="mt-6 text-xs text-subtle">Demo build: any email and a password of 8+ characters will sign you in.</p> */}
        </form>
      </section>
    </div>
  );
}

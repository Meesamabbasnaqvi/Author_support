import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ApiError } from "../api/client";

// Authors create an account with the email BookLeaf has on file.
// Without a matching author record the account has no books, so the API should check this.
export default function SignUpPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Enter the name you publish under.");
    if (!email.trim().includes("@")) return setError("Enter the email address BookLeaf has for you.");
    if (password.length < 8) return setError("Choose a password of at least 8 characters.");
    if (password !== confirm) return setError("The two passwords do not match.");

    setBusy(true);
    try {
      await signUp(name.trim(), email.trim().toLowerCase(), password);
      navigate("/home", { replace: true });
    } catch (error) {
      setError(error instanceof ApiError ? error.message : "We could not create your account. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <form onSubmit={onSubmit} className="w-full max-w-sm" noValidate>
        <Link to="/" className="text-sm text-muted hover:text-ink">← Back</Link>
        <p className="mt-6 text-sm font-medium text-accent">Authors</p>
        <h1 className="mt-1 font-serif text-[28px] font-semibold">Create your account</h1>
        <p className="mt-2 text-sm text-muted">Use the email BookLeaf has on file for your books.</p>

        <div className="mt-8 space-y-4">
          <Field id="name" label="Name as published" value={name} onChange={setName} autoComplete="name" />
          <Field id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
          <Field id="password" label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" hint="At least 8 characters" />
          <Field id="confirm" label="Confirm password" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-critical/25 bg-red-50/60 px-3 py-2 text-sm text-critical">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary mt-6 w-full">
          {busy ? "Creating account…" : "Create account"}
        </button>

        <p className="mt-6 text-sm text-muted">
          Already have an account? <Link to="/sign-in" className="font-medium text-accent hover:underline">Author login</Link>
        </p>
      </form>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      <input id={id} type={type} autoComplete={autoComplete} className="field" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </div>
  );
}

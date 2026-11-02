import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";

export default function ResetPasswordPage() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const token = params.get("token") || "";

    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password.length < 8) {
            setError("Password must be at least 8 characters long.");
            return;
        }
        if (password !== confirm) {
            setError("Passwords do not match.");
            return;
        }

        setBusy(true);
        try {
            await api.resetPassword(token, password);
            setSuccess(true);
            setTimeout(() => {
                navigate("/sign-in", { replace: true });
            }, 3000);
        } catch (err: unknown) {
            if (err instanceof Error && err.message) {
                setError(err.message);
            } else {
                setError("Failed to reset password. The link may have expired.");
            }
        } finally {
            setBusy(false);
        }
    };

    if (!token) {
        return (
            <div className="flex min-h-screen items-center justify-center p-8">
                <div className="w-full max-w-sm text-center">
                    <h1 className="font-serif text-2xl font-semibold">Invalid reset link</h1>
                    <p className="mt-2 text-sm text-muted">
                        This password reset link is missing a valid token.
                    </p>
                    <Link to="/forgot-password" className="btn-primary mt-6 inline-block">
                        Request a new link
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center p-8">
            <div className="w-full max-w-sm">
                <h1 className="font-serif text-[28px] font-semibold">Create new password</h1>
                <p className="mt-2 text-sm text-muted">
                    Your new password must be at least 8 characters long.
                </p>

                {success ? (
                    <div className="mt-6 rounded-lg border border-accent/30 bg-accent-soft p-4 text-sm text-ink">
                        <p className="font-semibold text-accent mb-1">Password reset successfully!</p>
                        <p>Redirecting you to the sign-in page in a few seconds...</p>
                        <Link to="/sign-in" className="mt-3 block font-medium text-accent underline">
                            Sign in now →
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
                        <div>
                            <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
                                New password
                            </label>
                            <input
                                id="password"
                                type="password"
                                autoComplete="new-password"
                                className="field"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>

                        <div>
                            <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium">
                                Confirm new password
                            </label>
                            <input
                                id="confirm"
                                type="password"
                                autoComplete="new-password"
                                className="field"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                            />
                        </div>

                        {error && (
                            <p role="alert" className="rounded-lg border border-critical/25 bg-red-50/60 px-3 py-2 text-sm text-critical">
                                {error}
                            </p>
                        )}

                        <button type="submit" disabled={busy} className="btn-primary mt-4 w-full">
                            {busy ? "Updating password…" : "Reset password"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
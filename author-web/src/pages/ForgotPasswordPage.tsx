import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    // const [devLink, setDevLink] = useState<string | null>(null);

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (!email.trim().includes("@")) {
            setError("Please enter a valid email address.");
            return;
        }

        setBusy(true);
        try {
            const res = await api.forgotPassword(email.trim().toLowerCase());
            setSuccessMessage(res.message);
            // if (res.devResetLink) {
            //     setDevLink(res.devResetLink);
            // }
        } catch (err: unknown) {
            if (err instanceof Error && err.message) {
                setError(err.message);
            } else {
                setError("Unable to process request. Please try again.");
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center p-8">
            <div className="w-full max-w-sm">
                <Link to="/sign-in" className="text-sm text-muted hover:text-ink">
                    ← Back to sign in
                </Link>
                <h1 className="mt-6 font-serif text-[28px] font-semibold">Reset your password</h1>
                <p className="mt-2 text-sm text-muted">
                    Enter your registered email address and we will send you a link to reset your password.
                </p>

                {successMessage ? (
                    <div className="mt-6 space-y-4">
                        <div className="rounded-lg border border-accent/30 bg-accent-soft p-4 text-sm text-ink">
                            <p className="font-semibold text-accent mb-1">Check your inbox</p>
                            <p>{successMessage}</p>
                        </div>
                        {/* comment below  for hide dev link so only main user can access theri account*/}
                        {/* {devLink && (
                            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                                <p className="font-semibold mb-1">🛠️ Local Dev Shortcut:</p>
                                <a href={devLink} className="text-accent underline font-mono break-all">
                                    Click here to open your reset link
                                </a>
                            </div>
                        )} */}

                        <Link to="/sign-in" className="btn-primary block text-center mt-4">
                            Return to sign in
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
                        <div>
                            <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                                Email address
                            </label>
                            <input
                                id="email"
                                type="email"
                                autoComplete="email"
                                className="field"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        {error && (
                            <p role="alert" className="rounded-lg border border-critical/25 bg-red-50/60 px-3 py-2 text-sm text-critical">
                                {error}
                            </p>
                        )}

                        <button type="submit" disabled={busy} className="btn-primary mt-2 w-full">
                            {busy ? "Sending link…" : "Send reset link"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
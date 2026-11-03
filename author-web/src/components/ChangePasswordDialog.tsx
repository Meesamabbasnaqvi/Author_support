import { useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { api } from "../api/client";

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
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


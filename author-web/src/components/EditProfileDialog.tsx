import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, User, Phone, MapPin, Mail, X } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../lib/auth";

export function EditProfileDialog({ onClose }: { onClose: () => void }) {
  const { me, updateMe } = useAuth();
  const profileQuery = useQuery({
    queryKey: ["author-profile"],
    queryFn: () => api.getProfile(),
    staleTime: 60_000,
  });

  const [name, setName] = useState(me?.name ?? "");
  const [phone, setPhone] = useState(me?.phone ?? "");
  const [city, setCity] = useState(me?.city ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Sync state if profile query loads fresh data
  useEffect(() => {
    if (profileQuery.data) {
      if (profileQuery.data.name) setName(profileQuery.data.name);
      if (profileQuery.data.phone !== undefined) setPhone(profileQuery.data.phone ?? "");
      if (profileQuery.data.city !== undefined) setCity(profileQuery.data.city ?? "");
    }
  }, [profileQuery.data]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError("Please enter your full name (at least 2 characters).");
      return;
    }

    setBusy(true);
    try {
      const res = await api.updateProfile({
        name: trimmedName,
        phone: phone.trim() ? phone.trim() : null,
        city: city.trim() ? city.trim() : null,
      });

      updateMe(res.user);
      setSuccess("Your author profile has been updated successfully.");
      setTimeout(() => onClose(), 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <User className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink">Edit Author Profile</h3>
              <p className="text-xs text-muted">Update your public author name and contact details</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted transition hover:bg-canvas hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {success ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600 animate-in zoom-in-75 duration-200" />
            <p className="mt-3 text-sm font-semibold text-emerald-800">{success}</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            {error && (
              <p className="rounded-lg border border-critical/30 bg-red-50/80 px-3 py-2 text-xs text-critical">
                {error}
              </p>
            )}

            <div>
              <label htmlFor="profile-name" className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink">
                <User className="h-3.5 w-3.5 text-muted" /> Full Name <span className="text-critical">*</span>
              </label>
              <input
                id="profile-name"
                type="text"
                required
                minLength={2}
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Priya Sharma"
                className="field"
                disabled={busy}
              />
              <span className="text-[11px] text-muted">This name is used on support replies and your catalog.</span>
            </div>

            <div>
              <label htmlFor="profile-phone" className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink">
                <Phone className="h-3.5 w-3.5 text-muted" /> Contact Number
              </label>
              <input
                id="profile-phone"
                type="tel"
                maxLength={30}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
                className="field"
                disabled={busy}
              />
              <span className="text-[11px] text-muted">For urgent book delivery or royalty communication.</span>
            </div>

            <div>
              <label htmlFor="profile-city" className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink">
                <MapPin className="h-3.5 w-3.5 text-muted" /> City / Location
              </label>
              <input
                id="profile-city"
                type="text"
                maxLength={100}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. New Delhi, India"
                className="field"
                disabled={busy}
              />
            </div>

            <div className="rounded-lg bg-canvas p-3 border border-line/60">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <Mail className="h-3.5 w-3.5 text-muted" /> Registered Email
              </label>
              <p className="mt-1 font-mono text-xs text-ink select-all">{me?.email}</p>
              <p className="mt-1 text-[11px] text-muted">
                Tied to your publishing agreements. Contact support if you need to transfer email ownership.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button type="button" onClick={onClose} className="btn-secondary" disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}


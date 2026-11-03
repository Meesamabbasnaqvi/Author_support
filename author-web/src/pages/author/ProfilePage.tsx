import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  User,
  Phone,
  MapPin,
  Mail,
  BookOpen,
  Calendar,
  KeyRound,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../lib/auth";
import { Card, Avatar, LoadingRows } from "../../components/ui";
import { dateShort } from "../../lib/labels";
import { EditProfileDialog } from "../../components/EditProfileDialog";
import { ChangePasswordDialog } from "../../components/ChangePasswordDialog";

export default function ProfilePage() {
  const { me } = useAuth();
  const [showEdit, setShowEdit] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["author-profile"],
    queryFn: () => api.getProfile(),
  });

  const profile = profileQuery.data;
  const displayName = profile?.name ?? me?.name ?? "Author";
  const displayPhone = profile?.phone ?? me?.phone;
  const displayCity = profile?.city ?? me?.city;
  const displayEmail = profile?.email ?? me?.email;

  return (
    <>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Your Account</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight">Author Profile</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowChangePassword(true)}
            className="btn-secondary"
          >
            <KeyRound className="h-4 w-4" aria-hidden /> Change password
          </button>
          <button
            type="button"
            onClick={() => setShowEdit(true)}
            className="btn-primary"
          >
            <Pencil className="h-4 w-4" aria-hidden /> Edit profile
          </button>
        </div>
      </header>

      {/* Hero Card */}
      <div className="card mb-8 overflow-hidden border border-line bg-surface p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <Avatar name={displayName} size="md" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold text-ink">{displayName}</h2>
                <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
                  Author
                </span>
                {profile?.authorId && (
                  <span className="rounded-md border border-line bg-canvas px-2 py-0.5 font-mono text-[11px] text-muted">
                    {profile.authorId}
                  </span>
                )}
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                <Mail className="h-3.5 w-3.5" /> {displayEmail}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowEdit(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-canvas px-4 py-2.5 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
          >
            <Pencil className="h-4 w-4" /> Edit details
          </button>
        </div>
      </div>

      {profileQuery.isLoading && <LoadingRows rows={3} />}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Contact & Personal Information Card */}
        <Card>
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-accent" />
              <h3 className="font-semibold text-ink">Personal & Contact Details</h3>
            </div>
            <button
              type="button"
              onClick={() => setShowEdit(true)}
              className="text-xs font-medium text-accent hover:underline"
            >
              Edit
            </button>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs font-medium text-muted">Full Name</p>
              <p className="mt-0.5 text-sm font-medium text-ink">{displayName}</p>
            </div>

            <div>
              <p className="text-xs font-medium text-muted">Contact Phone</p>
              {displayPhone ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-ink">
                  <Phone className="h-3.5 w-3.5 text-muted" /> {displayPhone}
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-muted italic">
                  No contact phone added.{" "}
                  <button
                    type="button"
                    onClick={() => setShowEdit(true)}
                    className="not-italic text-accent underline hover:text-ink"
                  >
                    Add contact number
                  </button>
                </p>
              )}
            </div>

            <div>
              <p className="text-xs font-medium text-muted">City / Location</p>
              {displayCity ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-ink">
                  <MapPin className="h-3.5 w-3.5 text-muted" /> {displayCity}
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-muted italic">
                  No city added.{" "}
                  <button
                    type="button"
                    onClick={() => setShowEdit(true)}
                    className="not-italic text-accent underline hover:text-ink"
                  >
                    Add city
                  </button>
                </p>
              )}
            </div>

            <div className="pt-2 border-t border-line/60">
              <p className="text-xs font-medium text-muted">Registered Email Address</p>
              <p className="mt-0.5 text-sm font-mono text-ink">{displayEmail}</p>
              <p className="mt-1 text-[11px] text-muted">
                Official email address on record with BookLeaf Publishing.
              </p>
            </div>
          </div>
        </Card>

        {/* Publishing Activity & Security */}
        <div className="space-y-6">
          <Card>
            <div className="flex items-center gap-2 border-b border-line pb-4">
              <BookOpen className="h-5 w-5 text-[#286447]" />
              <h3 className="font-semibold text-ink">Publishing & Activity</h3>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-canvas p-3 border border-line/60">
                <p className="text-xs text-muted">Published Titles</p>
                <p className="mt-1 font-serif text-2xl font-semibold text-ink">
                  {profile?.totalBooks ?? "—"}
                </p>
              </div>

              <div className="rounded-lg bg-canvas p-3 border border-line/60">
                <p className="text-xs text-muted">Support Tickets</p>
                <p className="mt-1 font-serif text-2xl font-semibold text-ink">
                  {profile?.totalTickets ?? "—"}
                </p>
              </div>
            </div>

            {profile?.joinedDate && (
              <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
                <Calendar className="h-3.5 w-3.5" /> Author since {dateShort(profile.joinedDate)}
              </p>
            )}
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b border-line pb-4">
              <ShieldCheck className="h-5 w-5 text-accent" />
              <h3 className="font-semibold text-ink">Account Security</h3>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Account Password</p>
                <p className="text-xs text-muted">Keep your account secure with a strong password.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowChangePassword(true)}
                className="btn-secondary text-xs"
              >
                Update password
              </button>
            </div>
          </Card>
        </div>
      </div>

      {showEdit && (
        <EditProfileDialog onClose={() => setShowEdit(false)} />
      )}

      {showChangePassword && (
        <ChangePasswordDialog onClose={() => setShowChangePassword(false)} />
      )}
    </>
  );
}

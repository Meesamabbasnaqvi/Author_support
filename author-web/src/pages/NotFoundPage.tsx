import { Link } from "react-router-dom";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { useAuth } from "../lib/auth";

export default function NotFoundPage() {
  const { me } = useAuth();
  const homePath = me ? (me.role === "ADMIN" ? "/admin" : "/home") : "/";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-canvas text-muted">
        <FileQuestion className="h-8 w-8 text-accent" />
      </div>

      <span className="rounded-full bg-canvas px-3 py-1 text-xs font-semibold text-muted">
        404 error
      </span>

      <h1 className="mt-4 font-serif text-3xl font-semibold sm:text-4xl">
        Page not found
      </h1>

      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        The page you are looking for doesn't exist, was moved, or the link you followed is incorrect.
      </p>

      <div className="mt-8 flex items-center gap-4">
        <Link
          to={homePath}
          className="btn-primary inline-flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Return to {me ? "dashboard" : "home"}
        </Link>
      </div>
    </div>
  );
}


import { Link, Navigate } from "react-router-dom";
import { ArrowRight, Headphones, BookOpen } from "lucide-react";
import { useAuth } from "../lib/auth";

// The front door. Authors and the support team each have their own way in.
export default function LandingPage() {
  const { me } = useAuth();
  if (me) return <Navigate to={me.role === "ADMIN" ? "/admin" : "/home"} replace />;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-8 py-6 lg:px-12">
        <Link to="/" className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-85">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-serif text-base font-semibold text-white" aria-hidden>
            B
          </span>
          <span className="font-semibold text-ink">BookLeaf</span>
          <span className="text-sm text-muted">Support</span>
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-4xl">
          <div className="max-w-xl">
            <h1 className="font-serif text-[40px] font-semibold leading-tight">Welcome to BookLeaf Support.</h1>
            <p className="mt-3 text-[17px] leading-relaxed text-muted">
              Authors can check royalties and raise queries. The support team works through them here.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <section className="card flex flex-col p-7">
              <BookOpen className="h-6 w-6 text-accent" aria-hidden />
              <h2 className="mt-5 text-xl font-semibold">I am an author</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">
                See your books and royalties, raise a query, and follow every reply in one place.
              </p>
              <div className="mt-6">
                <Link
                  to="/sign-in"
                  className="flex h-[50px] w-full items-center justify-between rounded-[10px] bg-[#2455A4] px-4 font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-[#1d4687]"
                >
                  <span className="text-[15px]">Author login</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E9F0FA] text-[#2455A4]">
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </span>
                </Link>
              </div>
            </section>

            <section className="card flex flex-col p-7">
              <Headphones className="h-6 w-6 text-[#286447]" aria-hidden />
              <h2 className="mt-5 text-xl font-semibold">I am on the support team</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">
                Work through the queue, draft and send replies, and keep notes for the team.
              </p>
              <div className="mt-6">
                <Link
                  to="/support/sign-in"
                  className="flex h-[50px] w-full items-center justify-between rounded-[10px] bg-[#286447] px-4 font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-[#20523a]"
                >
                  <span className="text-[15px]">Staff login</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EAF2ED] text-[#286447]">
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </span>
                </Link>
              </div>

            </section>
          </div>
          <div className="mt-8 text-center">
            <p className="text-sm text-muted">
              New author?{" "}
              <Link to="/sign-up" className="font-medium text-accent hover:underline">
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

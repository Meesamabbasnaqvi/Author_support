import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { AppShell } from "./components/AppShell";
import type { Role } from "./api/types";
import LandingPage from "./pages/LandingPage";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import HomePage from "./pages/author/HomePage";
import MyBooksPage from "./pages/author/MyBooksPage";
import MyTicketsPage from "./pages/author/MyTicketsPage";
import NewTicketPage from "./pages/author/NewTicketPage";
import AuthorTicketPage from "./pages/author/AuthorTicketPage";
import DashboardPage from "./pages/admin/DashboardPage";
import QueuePage from "./pages/admin/QueuePage";
import AdminTicketPage from "./pages/admin/AdminTicketPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import NotFoundPage from "./pages/NotFoundPage";

const homeFor = (role: Role) => (role === "ADMIN" ? "/admin" : "/home");

function Guard({ role, children }: { role: Role; children: ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <div className="p-10 text-sm text-muted">Loading…</div>;
  if (!me) return <Navigate to={role === "ADMIN" ? "/support/sign-in" : "/sign-in"} replace />;
  if (me.role !== role) return <Navigate to={homeFor(me.role)} replace />;
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  const { me } = useAuth();
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/sign-in" element={me ? <Navigate to={homeFor(me.role)} replace /> : <SignInPage role="AUTHOR" />} />
      <Route path="/sign-up" element={me ? <Navigate to={homeFor(me.role)} replace /> : <SignUpPage />} />
      <Route path="/support/sign-in" element={me ? <Navigate to={homeFor(me.role)} replace /> : <SignInPage role="ADMIN" />} />

      <Route path="/home" element={<Guard role="AUTHOR"><HomePage /></Guard>} />
      <Route path="/books" element={<Guard role="AUTHOR"><MyBooksPage /></Guard>} />
      <Route path="/tickets" element={<Guard role="AUTHOR"><MyTicketsPage /></Guard>} />
      <Route path="/tickets/new" element={<Guard role="AUTHOR"><NewTicketPage /></Guard>} />
      <Route path="/tickets/:id" element={<Guard role="AUTHOR"><AuthorTicketPage /></Guard>} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route path="/admin" element={<Guard role="ADMIN"><DashboardPage /></Guard>} />
      <Route path="/admin/queue" element={<Guard role="ADMIN"><QueuePage /></Guard>} />
      <Route path="/admin/tickets/:id" element={<Guard role="ADMIN"><AdminTicketPage /></Guard>} />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

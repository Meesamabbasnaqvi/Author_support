import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Me, Role } from "../api/types";

interface AuthValue {
  me: Me | null;
  loading: boolean;
  signIn: (email: string, password: string, role: Role) => Promise<Me>;
  signUp: (name: string, email: string, password: string) => Promise<Me>;
  signOut: () => Promise<void>;
  updateMe: (user: Me) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [local, setLocal] = useState<Me | null | undefined>(undefined);
  const q = useQuery({ queryKey: ["me"], queryFn: () => api.me(), staleTime: Infinity });

  const me = local !== undefined ? local : (q.data ?? null);

  const value: AuthValue = {
    me,
    loading: q.isLoading && local === undefined,
    signIn: async (email, password, role) => {
      const user = await api.signIn(email, password, role);
      setLocal(user);
      qc.setQueryData(["me"], user);
      return user;
    },
    signUp: async (name, email, password) => {
      const user = await api.signUp(name, email, password);
      setLocal(user);
      qc.setQueryData(["me"], user);
      return user;
    },
    signOut: async () => {
      await api.signOut();
      setLocal(null);
      qc.clear();
    },
    updateMe: (user: Me) => {
      setLocal(user);
      qc.setQueryData(["me"], user);
      qc.invalidateQueries({ queryKey: ["author-summary"] });
      qc.invalidateQueries({ queryKey: ["author-profile"] });
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

import { useQuery } from "@tanstack/react-query";
import type { TicketListItem } from "./types.js";

const TOKEN_KEY = "author-support-token";

export type TicketFilters = {
  status?: string;
  priority?: string;
  category?: string;
  unassigned?: boolean;
  assignedAdminId?: number;
};

export type { TicketListItem };

export type TicketListResponse = { tickets: TicketListItem[] };

export type TicketStats = {
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  unassigned: number;
};

function authHeaders(): HeadersInit {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: authHeaders() });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

function toQuery(filters: TicketFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.category) params.set("category", filters.category);
  if (filters.unassigned !== undefined) params.set("unassigned", String(filters.unassigned));
  if (filters.assignedAdminId !== undefined) params.set("assignedAdminId", String(filters.assignedAdminId));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useTicketList(filters: TicketFilters, options?: { pollMs?: number }) {
  return useQuery({
    queryKey: ["tickets", "list", filters],
    queryFn: () => getJson<TicketListResponse>(`/tickets${toQuery(filters)}`),
    refetchInterval: options?.pollMs ?? 15000,
    refetchIntervalInBackground: false,
  });
}

export function useTicketStats(enabled: boolean) {
  return useQuery({
    queryKey: ["tickets", "stats"],
    queryFn: () => getJson<TicketStats>("/tickets/stats"),
    enabled,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
}


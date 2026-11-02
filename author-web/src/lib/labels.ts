import type { Category, Priority, TicketStatus } from "../api/types";

export const categoryLabel: Record<Category, string> = {
  ROYALTY_PAYMENTS: "Royalty & payments",
  ISBN_METADATA: "ISBN & metadata",
  PRINTING_QUALITY: "Printing & quality",
  DISTRIBUTION_AVAILABILITY: "Distribution & availability",
  BOOK_STATUS_PRODUCTION: "Book status & production",
  GENERAL_INQUIRY: "General inquiry",
};

export const categoryOptions = Object.keys(categoryLabel) as Category[];

export const statusLabel: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const statusOptions: TicketStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export const priorityLabel: Record<Priority, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export const priorityOptions: Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

// Priority is a small coloured dot plus text. Never a filled block.
export const priorityDot: Record<Priority, string> = {
  CRITICAL: "bg-critical",
  HIGH: "bg-high",
  MEDIUM: "bg-medium",
  LOW: "bg-low",
};

export const priorityText: Record<Priority, string> = {
  CRITICAL: "text-critical",
  HIGH: "text-warn",
  MEDIUM: "text-ink",
  LOW: "text-muted",
};

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const money = (n: number) => `₹${inr.format(n)}`;

export const dateShort = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export const timeAgo = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} days ago`;
  return dateShort(iso);
};

export const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

export const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

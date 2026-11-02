import type { TicketDetail, TicketListItem } from "../api/types";

export const progressSteps = ["Received", "In progress", "Replied", "Resolved"] as const;

// 0 = received, 1 = in progress, 2 = the team has replied, 3 = resolved or closed.
// Derived from the ticket's status and messages. Nothing here is decided by AI.
export function progressStage(t: Pick<TicketListItem, "status"> & { messages?: TicketDetail["messages"] }): number {
  if (t.status === "RESOLVED" || t.status === "CLOSED") return 3;
  if (t.messages?.some((m) => m.isAdmin)) return 2;
  if (t.status === "IN_PROGRESS") return 1;
  return 0;
}

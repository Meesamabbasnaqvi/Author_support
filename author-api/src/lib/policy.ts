export type TicketPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

// Response windows (SLA) in hours
export const RESPONSE_WINDOWS_HOURS: Record<TicketPriority, number> = {
    CRITICAL: 24,
    HIGH: 48,
    MEDIUM: 120,
    LOW: 168,
};

/**
 * Checks if a ticket has exceeded its SLA response window.
 */
export function isTicketOverdue(
    createdAt: Date | string,
    priority: TicketPriority,
    now: Date = new Date()
): boolean {
    const created = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
    const windowHours = RESPONSE_WINDOWS_HOURS[priority] ?? 48;
    const elapsedHours = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
    return elapsedHours > windowHours;
}
import type { TicketPriority } from "./policy.js";

export type TicketCategory =
    | "ROYALTY_PAYMENTS"
    | "ISBN_METADATA"
    | "PRINTING_QUALITY"
    | "DISTRIBUTION_AVAILABILITY"
    | "BOOK_STATUS_PRODUCTION"
    | "GENERAL_INQUIRY";

export interface TriageInput {
    category: TicketCategory;
    bookStatus?: string | null;
    isWrongIsbn?: boolean;
    isBookUnavailable?: boolean;
    isOverduePayout?: boolean;
    isProductionDelay?: boolean;
}

export interface TriageResult {
    priority: TicketPriority;
    reason: string;
}

// Priority ranks for comparison: LOW (1) < MEDIUM (2) < HIGH (3) < CRITICAL (4)
const PRIORITY_RANKS: Record<TicketPriority, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
};

// Base priority table by category - GENERAL_INQUIRY defaults to MEDIUM per spec
export const BASE_CATEGORY_PRIORITY: Record<TicketCategory, TicketPriority> = {
    ROYALTY_PAYMENTS: "MEDIUM",
    ISBN_METADATA: "MEDIUM",
    PRINTING_QUALITY: "MEDIUM",
    DISTRIBUTION_AVAILABILITY: "MEDIUM",
    BOOK_STATUS_PRODUCTION: "MEDIUM",
    GENERAL_INQUIRY: "MEDIUM",
};

/**
 * Determines ticket priority and an explanatory reason based on category and business signals.
 * Pure deterministic function without state mutation or side effects.
 */
export function suggestPriority(input: TriageInput): TriageResult {
    const basePriority = BASE_CATEGORY_PRIORITY[input.category] ?? "MEDIUM";
    let suggestedPriority: TicketPriority = basePriority;
    let reason = `Standard priority for ${input.category.toLowerCase().replace(/_/g, " ")}.`;

    // Rule 4: A book in production never goes above Medium for delays
    const isInProduction = input.bookStatus?.toLowerCase() === "in production";
    if (isInProduction && (input.isProductionDelay || input.category === "BOOK_STATUS_PRODUCTION")) {
        suggestedPriority = "MEDIUM";
        reason = "Production schedule delays for unreleased books are capped at medium priority.";
        return { priority: suggestedPriority, reason };
    }

    // Rule 3: An overdue payout is Critical
    if (input.category === "ROYALTY_PAYMENTS" && input.isOverduePayout) {
        suggestedPriority = "CRITICAL";
        reason = "Overdue royalty payouts are critical financial compliance issues.";
    }
    // Rule 1: Wrong ISBN is at least High
    else if (input.category === "ISBN_METADATA" && input.isWrongIsbn) {
        if (PRIORITY_RANKS[suggestedPriority] < PRIORITY_RANKS.HIGH) {
            suggestedPriority = "HIGH";
        }
        reason = "ISBN errors block retailer catalog listings and store discovery.";
    }
    // Rule 2: An unavailable book is High
    else if (input.category === "DISTRIBUTION_AVAILABILITY" && input.isBookUnavailable) {
        if (PRIORITY_RANKS[suggestedPriority] < PRIORITY_RANKS.HIGH) {
            suggestedPriority = "HIGH";
        }
        reason = "An unavailable live book directly prevents retail sales.";
    }



    return { priority: suggestedPriority, reason };
}

/**
 * Server-side clamp enforcing policy:
 * 1. CRITICAL is strictly reserved for overdue royalty payouts.
 * 2. Wrong ISBN errors are clamped to HIGH (not Critical).
 */
export function clampAiPriority(params: {
    category: TicketCategory;
    rawPriority: TicketPriority;
    isWrongIsbn?: boolean;
    isOverduePayout?: boolean;
}): TicketPriority {
    let priority = params.rawPriority;

    // Rule 1: CRITICAL is strictly reserved for overdue royalty payouts
    const isAllowedCritical = params.category === "ROYALTY_PAYMENTS" && !!params.isOverduePayout;
    if (priority === "CRITICAL" && !isAllowedCritical) {
        priority = "HIGH";
    }

    // Rule 2: Wrong ISBN must be at least High (and never Critical per Rule 1)
    if (params.category === "ISBN_METADATA" && !!params.isWrongIsbn) {
        if (PRIORITY_RANKS[priority] < PRIORITY_RANKS.HIGH || priority === "CRITICAL") {
            priority = "HIGH";
        }
    }

    return priority;
}


/**
 * Computes whether royalty payout for a book is overdue:
 * 1. Amount owed is at least Rs. 1,000 (royaltyPending >= 1000).
 * 2. Unpaid.
 * 3. The 45-day deadline has passed for the concluded quarter.
 */
export function isRoyaltyOverdue(
    book: { royaltyPending?: any; lastRoyaltyPayoutDate?: Date | string | null } | null | undefined,
    now: Date = new Date()
): boolean {
    if (!book) return false;
    const pending = Number(book.royaltyPending ?? 0);
    if (pending < 1000) return false;

    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const year = now.getFullYear();
    const month = now.getMonth();

    let lastQuarterEnd: Date;
    if (month >= 0 && month <= 2) {
        lastQuarterEnd = new Date(year - 1, 11, 31, 23, 59, 59);
    } else if (month >= 3 && month <= 5) {
        lastQuarterEnd = new Date(year, 2, 31, 23, 59, 59);
    } else if (month >= 6 && month <= 8) {
        lastQuarterEnd = new Date(year, 5, 30, 23, 59, 59);
    } else {
        lastQuarterEnd = new Date(year, 8, 30, 23, 59, 59);
    }

    const deadline = new Date(lastQuarterEnd.getTime() + 45 * MS_PER_DAY);
    if (now.getTime() <= deadline.getTime()) {
        return false;
    }

    const lastPayout = book.lastRoyaltyPayoutDate ? new Date(book.lastRoyaltyPayoutDate) : null;
    return !lastPayout || lastPayout.getTime() <= lastQuarterEnd.getTime();
}

/**
 * Calculates the number of days a royalty payout is overdue (0 if not overdue).
 * Increases with wall-clock time on every read.
 */
export function getRoyaltyOverdueDays(
    book: { royaltyPending?: any; lastRoyaltyPayoutDate?: Date | string | null } | null | undefined,
    now: Date = new Date()
): number {
    if (!isRoyaltyOverdue(book, now)) return 0;

    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const year = now.getFullYear();
    const month = now.getMonth();

    let lastQuarterEnd: Date;
    if (month >= 0 && month <= 2) {
        lastQuarterEnd = new Date(year - 1, 11, 31, 23, 59, 59);
    } else if (month >= 3 && month <= 5) {
        lastQuarterEnd = new Date(year, 2, 31, 23, 59, 59);
    } else if (month >= 6 && month <= 8) {
        lastQuarterEnd = new Date(year, 5, 30, 23, 59, 59);
    } else {
        lastQuarterEnd = new Date(year, 8, 30, 23, 59, 59);
    }

    const deadline = new Date(lastQuarterEnd.getTime() + 45 * MS_PER_DAY);
    const diffMs = now.getTime() - deadline.getTime();
    return Math.max(1, Math.floor(diffMs / MS_PER_DAY));
}

/**
 * Canonical policy constants, timelines, and verifier token regex patterns.
 * Shared as the single source of truth between the knowledge base parity tests
 * and the draft post-generation factual verifier.
 */

export const KB_CANONICAL_CONSTANTS = {
  // Monetary & splits
  MIN_PAYOUT_THRESHOLD: 1000,
  ROYALTY_SPLIT: "80/20",
  ROYALTY_AUTHOR_PERCENT: "80%",
  ROYALTY_PUBLISHER_PERCENT: "20%",

  // Canonical timelines with units from the knowledge base
  TIMELINES: [
    "24 to 48 hours",
    "24-48 hours",
    "48 hours",
    "48-hour",
    "3 to 5 business days",
    "3-5 business days",
    "3 to 5 business day",
    "5 to 7 business days",
    "5-7 business days",
    "5 to 7 business day",
    "7 to 10 business days",
    "7-10 business days",
    "45 days",
    "45-day",
    "3 weeks",
    "4 months",
  ],
} as const;

/**
 * Normalizes a timeline string for fuzzy comparison.
 * e.g., "48-hour" -> "48 hours", "3 - 5 business days" -> "3 to 5 business days"
 */
export function normalizeTimeline(val: string): string {
  return val
    .toLowerCase()
    .replace(/[-–]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/hour$/, "hours")
    .replace(/day$/, "days")
    .replace(/week$/, "weeks")
    .replace(/month$/, "months")
    .trim();
}

/**
 * Token extraction regular expressions for the 5 verified token types:
 * 1. Currency: ₹, Rs., or INR followed by an amount.
 * 2. Calendar dates: ISO dates (YYYY-MM-DD), or day + month name with optional year.
 * 3. ISBNs: 978 or 979 followed by 10 to 13 digits with optional hyphens or spaces.
 * 4. Timelines with units: a number or range followed by hours, days, business days, weeks, months.
 * 5. Percentages and royalty split: a number followed by %, and the phrase "80/20".
 */
export const VERIFIER_PATTERNS = {
  // 1. Currency
  CURRENCY: /(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{2})?/gi,

  // 2. Calendar dates (ISO YYYY-MM-DD or Month Day / Day Month)
  DATES: /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\s+\d{4})?|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)\b/gi,

  // 3. ISBNs (978 or 979 followed by 10 to 13 digits/hyphens)
  ISBN: /\b(?:978|979)[-\s\d]{10,17}\b/g,

  // 4. Timelines with units (handles "48-hour", "45-day", "24 to 48 hours", "3 to 5 business days", etc.)
  TIMELINE_WITH_UNIT: /\b(\d+(?:\s*(?:to|-|–)\s*\d+)?)\s*(?:-|–)?\s*(hours?|days?|business\s+days?|weeks?|months?)\b/gi,

  // 5. Percentages and the royalty split
  PERCENTAGE_OR_SPLIT: /\b(?:\d+%\s*-\s*\d+%|\d+%\s*\/\s*\d+%|\d+%|80\/20)\b/gi,
};

// Soft daily cap on AI calls (soft limit under concurrency)
export const DAILY_AI_CAP = Number(process.env.DAILY_AI_CAP) || 500;

import {
  KB_CANONICAL_CONSTANTS,
  VERIFIER_PATTERNS,
  normalizeTimeline,
} from "./constants.js";
import type { DraftFact } from "./llm.js";

interface VerifyDraftParams {
  body: string;
  serverFacts: DraftFact[];
  authorText: string;
}

interface VerificationResult {
  body: string;
  placeholders: string[];
  factsUsed: DraftFact[];
}

/**
 * Normalizes text for lenient matching (lowercase, removes commas, trims spaces).
 */
function normalizeForComparison(val: string): string {
  return val.toLowerCase().replace(/,/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Checks whether an extracted token appears in server-provided facts,
 * canonical knowledge base constants, or the author's own messages.
 */
function isTokenAllowed(token: string, allowedPool: Set<string>, normalizedAuthorText: string): boolean {
  const norm = normalizeForComparison(token);

  // Exact or subset match in server facts / KB constants
  for (const item of allowedPool) {
    if (item.includes(norm) || norm.includes(item)) {
      return true;
    }
  }

  // Allowed if author themselves wrote this number/figure in their ticket/message
  if (normalizedAuthorText.includes(norm)) {
    return true;
  }

  return false;
}

/**
 * Verifies that currency amounts, calendar dates, ISBNs, timelines, and percentages
 * in the drafted body match verified server facts, author-stated numbers, or KB policies.
 * Unmatched tokens are replaced in-place with `[ADMIN: verify <token>]` placeholders.
 */
export function verifyDraft(params: VerifyDraftParams): VerificationResult {
  let verifiedBody = params.body;
  const allowedPool = new Set<string>();
  const normalizedAuthorText = normalizeForComparison(params.authorText);

  // 1. Add server-supplied facts
  for (const fact of params.serverFacts) {
    allowedPool.add(normalizeForComparison(fact.value));
    // Also add digits/values stripped of currency symbols
    const numOnly = fact.value.replace(/[^0-9.-]/g, "");
    if (numOnly.length > 0) {
      allowedPool.add(numOnly);
    }
  }

  // 2. Add canonical KB constants & timelines
  allowedPool.add(String(KB_CANONICAL_CONSTANTS.MIN_PAYOUT_THRESHOLD));
  allowedPool.add(normalizeForComparison(KB_CANONICAL_CONSTANTS.ROYALTY_SPLIT));
  allowedPool.add(normalizeForComparison(KB_CANONICAL_CONSTANTS.ROYALTY_AUTHOR_PERCENT));
  allowedPool.add(normalizeForComparison(KB_CANONICAL_CONSTANTS.ROYALTY_PUBLISHER_PERCENT));

  for (const tl of KB_CANONICAL_CONSTANTS.TIMELINES) {
    allowedPool.add(normalizeForComparison(tl));
    allowedPool.add(normalizeTimeline(tl));
  }

  // Helper to replace unverified tokens
  const replaceUnverified = (pattern: RegExp, tokenType: string) => {
    verifiedBody = verifiedBody.replace(pattern, (match) => {
      // Don't replace if already inside an [ADMIN: ...] placeholder
      if (match.startsWith("[ADMIN:") || match.includes("[ADMIN:")) {
        return match;
      }

      // Check for timeline normalized match
      if (tokenType === "timeline") {
        const normTl = normalizeTimeline(match);
        for (const item of allowedPool) {
          if (item === normTl || normTl.includes(item)) {
            return match;
          }
        }
      }

      if (isTokenAllowed(match, allowedPool, normalizedAuthorText)) {
        return match;
      }

      return `[ADMIN: verify ${match.trim()}]`;
    });
  };

  // Run replacements across the 5 token types
  replaceUnverified(VERIFIER_PATTERNS.CURRENCY, "currency");
  replaceUnverified(VERIFIER_PATTERNS.DATES, "date");
  replaceUnverified(VERIFIER_PATTERNS.ISBN, "isbn");
  replaceUnverified(VERIFIER_PATTERNS.TIMELINE_WITH_UNIT, "timeline");
  replaceUnverified(VERIFIER_PATTERNS.PERCENTAGE_OR_SPLIT, "percentage");

  // Extract all final [ADMIN: ...] placeholders from the verified body
  const placeholderRegex = /\[ADMIN:[^\]]+\]/gi;
  const matches = verifiedBody.match(placeholderRegex) || [];
  const uniquePlaceholders = Array.from(new Set(matches.map((p) => p.trim())));

  return {
    body: verifiedBody,
    placeholders: uniquePlaceholders,
    factsUsed: params.serverFacts,
  };
}


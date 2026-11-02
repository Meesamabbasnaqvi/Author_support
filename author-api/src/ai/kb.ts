import fs from "node:fs/promises";
import path from "node:path";
import type { TicketCategory } from "./llm.js";

const KB_DIR = path.resolve(process.cwd(), "docs", "kb");

const CATEGORY_FILE_MAP: Record<TicketCategory, string> = {
  ROYALTY_PAYMENTS: "royalty_payments.md",
  ISBN_METADATA: "isbn_metadata.md",
  PRINTING_QUALITY: "printing_quality.md",
  DISTRIBUTION_AVAILABILITY: "distribution_availability.md",
  BOOK_STATUS_PRODUCTION: "book_status_production.md",
  GENERAL_INQUIRY: "general_inquiry.md",
};

/**
 * Returns a concise routing summary of the 6 categories for ticket classification.
 * Kept compact to conserve token budget during classification.
 */
export async function getRoutingSummary(): Promise<string> {
  return `
1. ROYALTY_PAYMENTS: Royalty calculations, payout cycles (quarterly + 45 days), minimum thresholds (₹1,000), bank account linking, sales reports.
2. ISBN_METADATA: ISBN assignment, wrong ISBN linked on stores, barcode issues, metadata discrepancies.
3. PRINTING_QUALITY: Physical copy defects, blurry text/images, misprints, binding issues, requests for free reprints.
4. DISTRIBUTION_AVAILABILITY: Book listing status on Amazon/Flipkart/BookLeaf store, "Currently Unavailable" stock sync issues.
5. BOOK_STATUS_PRODUCTION: Publishing progress, production milestones (manuscript, cover design, typesetting, proofreading), delay inquiries for unreleased books.
6. GENERAL_INQUIRY: General questions not fitting above, updating book description/metadata post-publication, general publisher inquiries.
`.trim();
}

export interface CategoryKbContent {
  generalTone: string;
  categoryRules: string;
  samples: string;
}

/**
 * Loads knowledge base content for a specific category.
 * Reads ONLY _general.md and the designated category file, extracting
 * policies, tone guidelines, and calibration sample Q&As.
 */
export async function getCategoryKb(category: TicketCategory): Promise<CategoryKbContent> {
  const fileName = CATEGORY_FILE_MAP[category] ?? "general_inquiry.md";
  const generalPath = path.join(KB_DIR, "_general.md");
  const categoryPath = path.join(KB_DIR, fileName);

  const [generalRaw, categoryRaw] = await Promise.all([
    fs.readFile(generalPath, "utf-8").catch(() => ""),
    fs.readFile(categoryPath, "utf-8").catch(() => ""),
  ]);

  // Extract tone section from _general.md
  const toneMatch = generalRaw.match(/## Tone[\s\S]*?(?=\n## Rules|\n#|$)/i);
  const rulesMatch = generalRaw.match(/## Rules for every answer[\s\S]*$/i);
  const generalTone = [toneMatch?.[0] ?? "", rulesMatch?.[0] ?? ""].filter(Boolean).join("\n\n");

  // Extract samples from category file
  const samplesMatch = categoryRaw.match(/## Sample Q&A[\s\S]*$/i);
  const samples = samplesMatch?.[0] ?? "";

  // The rest of category file is category rules & policies
  const categoryRules = categoryRaw.replace(/## Sample Q&A[\s\S]*$/i, "").trim();

  return {
    generalTone: generalTone.trim(),
    categoryRules,
    samples: samples.trim(),
  };
}


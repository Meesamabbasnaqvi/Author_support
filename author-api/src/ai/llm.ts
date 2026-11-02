import { z } from "zod";
import type { TicketPriority } from "../lib/policy.js";
import type { TicketCategory } from "../lib/triage.js";

export type { TicketPriority, TicketCategory };

export const TICKET_CATEGORIES = [
  "ROYALTY_PAYMENTS",
  "ISBN_METADATA",
  "PRINTING_QUALITY",
  "DISTRIBUTION_AVAILABILITY",
  "BOOK_STATUS_PRODUCTION",
  "GENERAL_INQUIRY",
] as const;

export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

// The only accepted shape of a classification. Anything else throws, so the worker records the failure and retries.
// No defaults: a missing or invalid field is a failed call, never a guessed value.
export const classificationSchema = z.object({
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES),
  isWrongIsbn: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.slice(0, 300)),
});

export interface ClassificationResult {
  category: TicketCategory;
  priority: TicketPriority;
  confidence: number;
  reason: string;
  isWrongIsbn: boolean;
}

export interface DraftFact {
  label: string;
  value: string;
}

export interface DraftResult {
  body: string;
  placeholders: string[];
  factsUsed: DraftFact[];
}

export interface LlmCallOptions {
  signal?: AbortSignal;
}

export interface LlmClient {
  classify(prompt: string, options?: LlmCallOptions): Promise<ClassificationResult>;
  draft(prompt: string, options?: LlmCallOptions): Promise<DraftResult>;
}
import type {
  LlmClient,
  LlmCallOptions,
  ClassificationResult,
  DraftResult,
} from "./llm.js";

export class FakeClient implements LlmClient {
  private cannedClassification: ClassificationResult | null = null;
  private cannedDraft: DraftResult | null = null;

  setNextClassification(result: ClassificationResult | null): void {
    this.cannedClassification = result;
  }

  setNextDraft(result: DraftResult | null): void {
    this.cannedDraft = result;
  }

  async classify(
    prompt: string,
    _options?: LlmCallOptions
  ): Promise<ClassificationResult> {
    if (this.cannedClassification) {
      const res = this.cannedClassification;
      this.cannedClassification = null;
      return res;
    }

    const lower = prompt.toLowerCase();

    if (lower.includes("isbn") || lower.includes("barcode")) {
      return {
        category: "ISBN_METADATA",
        priority: "HIGH",
        confidence: 0.95,
        reason: "Ticket references ISBN / barcode discrepancy.",
        isWrongIsbn: true,
      };
    }

    if (lower.includes("royalty") || lower.includes("payout") || lower.includes("payment")) {
      const isOverdue = lower.includes("overdue") || lower.includes("months ago");
      return {
        category: "ROYALTY_PAYMENTS",
        priority: isOverdue ? "CRITICAL" : "MEDIUM",
        confidence: 0.92,
        reason: "Author inquiry regarding royalties or earnings.",
        isWrongIsbn: false,
      };
    }

    if (lower.includes("print") || lower.includes("blurry") || lower.includes("binding") || lower.includes("defective")) {
      return {
        category: "PRINTING_QUALITY",
        priority: "MEDIUM",
        confidence: 0.9,
        reason: "Printing defect or book physical copy quality issue.",
        isWrongIsbn: false,
      };
    }

    if (lower.includes("unavailable") || lower.includes("out of stock") || lower.includes("listing")) {
      return {
        category: "DISTRIBUTION_AVAILABILITY",
        priority: "HIGH",
        confidence: 0.88,
        reason: "Book distribution or retailer platform availability problem.",
        isWrongIsbn: false,
      };
    }

    if (lower.includes("production") || lower.includes("typesetting") || lower.includes("proofreading")) {
      return {
        category: "BOOK_STATUS_PRODUCTION",
        priority: "MEDIUM",
        confidence: 0.89,
        reason: "Production progress or publication milestone query.",
        isWrongIsbn: false,
      };
    }

    return {
      category: "GENERAL_INQUIRY",
      priority: "MEDIUM",
      confidence: 0.8,
      reason: "General inquiry from author.",
      isWrongIsbn: false,
    };
  }

  async draft(
    _prompt: string,
    _options?: LlmCallOptions
  ): Promise<DraftResult> {
    if (this.cannedDraft) {
      const res = this.cannedDraft;
      this.cannedDraft = null;
      return res;
    }

    return {
      body: "Hi,\n\nThanks for reaching out to BookLeaf Publishing. We have received your query and our team is looking into it. We will update you within 48 hours.\n\nWarm regards,\nBookLeaf Support",
      placeholders: [],
      factsUsed: [{ label: "SLA", value: "48 hours" }],
    };
  }
}


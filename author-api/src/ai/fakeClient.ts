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

    if (lower.includes("print") || lower.includes("blurry") || lower.includes("binding") || lower.includes("defective") || lower.includes("damaged") || lower.includes("torn")) {
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
    prompt: string,
    _options?: LlmCallOptions
  ): Promise<DraftResult> {
    if (this.cannedDraft) {
      const res = this.cannedDraft;
      this.cannedDraft = null;
      return res;
    }

    const lower = prompt.toLowerCase();
    const isUnspecified =
      lower.includes("not specified by author") ||
      lower.includes("book unspecified") ||
      lower.includes("critical instruction - book unspecified");
    const isDamaged =
      lower.includes("damaged") ||
      lower.includes("defective") ||
      lower.includes("printing_quality");

    if (isUnspecified && isDamaged) {
      return {
        body: "Hi,\n\nThank you for reaching out to BookLeaf Support. I am very sorry to hear that your book arrived in damaged condition—we want to make this right immediately.\n\nCould you please let us know which book this is regarding? Additionally, please reply with a few clear photos showing the damage (including the cover, binding, and packaging box) so our production team can verify and dispatch a free replacement for you right away.\n\nWarm regards,\nBookLeaf Support",
        placeholders: [],
        factsUsed: [{ label: "Issue", value: "Damaged Book Replacement (Unspecified Title)" }],
      };
    }

    if (isDamaged) {
      return {
        body: "Hi,\n\nThank you for reaching out to BookLeaf Support. I am very sorry to hear that your copy arrived damaged.\n\nCould you please share a few clear photos of the damaged areas along with the packaging box? Once verified, we will arrange a complimentary replacement copy for you right away.\n\nWarm regards,\nBookLeaf Support",
        placeholders: [],
        factsUsed: [{ label: "Issue", value: "Damaged Book Replacement" }],
      };
    }

    if (isUnspecified) {
      return {
        body: "Hi,\n\nThank you for reaching out to BookLeaf Publishing. We would be happy to help with your inquiry.\n\nTo assist you as quickly as possible, could you please confirm which book title you are referring to? Once confirmed, our team will review the details and assist you promptly.\n\nWarm regards,\nBookLeaf Support",
        placeholders: [],
        factsUsed: [{ label: "Status", value: "Awaiting Book Title Confirmation" }],
      };
    }

    return {
      body: "Hi,\n\nThanks for reaching out to BookLeaf Publishing. We have received your query and our team is looking into it. We will update you within 48 hours.\n\nWarm regards,\nBookLeaf Support",
      placeholders: [],
      factsUsed: [{ label: "SLA", value: "48 hours" }],
    };
  }
}


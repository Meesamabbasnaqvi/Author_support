import { GoogleGenAI } from "@google/genai";
import { classificationSchema, type LlmClient, type LlmCallOptions, type ClassificationResult, type DraftResult } from "./llm.js";

const classificationJsonSchema = {
  type: "object",
  properties: {
    category: {
      type: "string",
      enum: ["ROYALTY_PAYMENTS", "ISBN_METADATA", "PRINTING_QUALITY", "DISTRIBUTION_AVAILABILITY", "BOOK_STATUS_PRODUCTION", "GENERAL_INQUIRY"],
    },
    priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
    isWrongIsbn: { type: "boolean" },
    confidence: { type: "number" },
    reason: { type: "string" },
  },
  required: ["category", "priority", "isWrongIsbn", "confidence", "reason"],
};

const draftJsonSchema = {
  type: "object",
  properties: {
    body: { type: "string" },
    placeholders: { type: "array", items: { type: "string" } },
    factsUsed: {
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string" }, value: { type: "string" } },
        required: ["label", "value"],
      },
    },
  },
  required: ["body", "placeholders", "factsUsed"],
};

export class GeminiClient implements LlmClient {
  private ai: GoogleGenAI;
  private model: string;

  constructor(apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    if (!model) throw new Error("GEMINI_MODEL is not set");
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  private extractJson(rawText: string): unknown {
    const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1] ?? rawText;
    return JSON.parse(candidate.trim());
  }
  private async callModel(prompt: string, schema: object, options?: LlmCallOptions): Promise<string> {
    const interaction = await this.ai.interactions.create({
      model: this.model,
      input: prompt,
      response_format: { type: "text", mime_type: "application/json", schema },
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    if (!interaction.output_text) throw new Error("Gemini response had no output_text");
    return interaction.output_text;
  }

  async classify(prompt: string, options?: LlmCallOptions): Promise<ClassificationResult> {
    const raw = await this.callModel(prompt, classificationJsonSchema, options);
    return classificationSchema.parse(this.extractJson(raw));
  }

  async draft(prompt: string, options?: LlmCallOptions): Promise<DraftResult> {
    const raw = await this.callModel(prompt, draftJsonSchema, options);
    const parsed = this.extractJson(raw) as Partial<DraftResult>;
    return {
      body: typeof parsed.body === "string" ? parsed.body : "",
      placeholders: Array.isArray(parsed.placeholders) ? parsed.placeholders : [],
      factsUsed: Array.isArray(parsed.factsUsed) ? parsed.factsUsed : [],
    };
  }
}

let instance: GeminiClient | null = null;
export function getGeminiClient(): GeminiClient {
  if (!instance) instance = new GeminiClient();
  return instance;
}
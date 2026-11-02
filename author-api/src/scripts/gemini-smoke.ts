import "dotenv/config";
import { getGeminiClient } from "../ai/geminiClient.js";

async function main() {
  console.log("Starting Gemini Smoke Test...");

  try {
    const client = getGeminiClient();

    console.log("1. Testing classify()...");
    const classResult = await client.classify(`
You are a ticket classification assistant. Classify this ticket into JSON:
Subject: Missing royalty payout from last quarter
Description: I sold over 200 copies on Amazon but haven't received my quarterly payment yet.
    `);
    console.log("Classification result:", JSON.stringify(classResult, null, 2));

    console.log("\n2. Testing draft()...");
    const draftResult = await client.draft(`
Draft an empathetic reply acknowledging the author's payout query:
Author: Jane Doe
Book: The Hidden Trail
Output JSON with body, placeholders, and factsUsed.
    `);
    console.log("Draft result:", JSON.stringify(draftResult, null, 2));

    console.log("\nGemini Smoke Test PASSED!");
  } catch (error) {
    console.error("\nGemini Smoke Test FAILED:", error);
    process.exit(1);
  }
}

main();


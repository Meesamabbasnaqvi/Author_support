import "dotenv/config";
import { startWorker } from "../ai/worker.js";

console.log("Starting BookLeaf AI Classification Worker (polling every 5s)...");
const stop = startWorker(5000);

process.on("SIGINT", () => {
  console.log("Stopping AI worker...");
  stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Stopping AI worker...");
  stop();
  process.exit(0);
});


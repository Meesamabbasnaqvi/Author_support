import rateLimit from "express-rate-limit";

// Generous for a real admin. Stops a runaway polling loop or a scripted scrape.
export const ticketReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});
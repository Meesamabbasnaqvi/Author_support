import dotenv from "dotenv";
import path from "node:path";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config({ path: "/etc/secrets/.env" });

import express from "express";
import { randomUUID } from "node:crypto";
import helmet from "helmet";
import cors from "cors";
import { uploadMiddleware } from "./middleware/upload.js";
import { storage } from "./lib/storage.js";

import { prisma } from "./lib/prisma.js";
import authRouter from "./routes/auth.js";
import {
  requireAuth,
  requireAdmin,
  type AuthenticatedRequest,
} from "./middleware/auth.js";
import ticketsRouter from "./routes/tickets.js";
import ticketStatsRouter from "./routes/ticketStats.js";

const app = express();

// Trust the first reverse proxy hop (Nginx, Cloudflare, ALB, etc.)
// so req.ip resolves to the real client IP for rate limiting instead of the proxy IP.
// Value is explicitly set to 1 (not true) to prevent clients from forging X-Forwarded-For headers.
app.set("trust proxy", 1);

const PORT = Number(process.env.PORT) || 3000;
const FRONTEND_URL =
  process.env.FRONTEND_URL || "http://localhost:5173";
app.use(helmet());
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "50kb" }));

// Static uploads directory
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
app.use("/uploads", express.static(UPLOAD_DIR));

// File upload endpoint (Images & PDFs up to 5MB, swappable storage)
app.post("/uploads", requireAuth, (req, res) => {
  uploadMiddleware.single("file")(req, res, async (err: any) => {
    if (err) {
      return res.status(400).json({ error: err.message || "File upload failed" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file was uploaded" });
    }
    try {
      const stored = await storage.save(req.file);
      return res.status(201).json({
        message: "File uploaded successfully",
        file: stored,
      });
    } catch (error) {
      console.error("Failed to store uploaded file:", error);
      return res.status(500).json({ error: "Failed to store file" });
    }
  });
});

// Authentication and ticket routes
app.use("/auth", authRouter);
app.use("/tickets", ticketStatsRouter);
app.use("/tickets", ticketsRouter);

// Health check
app.get("/", (_req, res) => {
  res.json({
    message: "Author Support Portal API is running!",
  });
});

// Get all authors
app.get("/authors", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const authors = await prisma.author.findMany();

    res.json(authors);
  } catch (error) {
    console.error("Failed to fetch authors:", error);

    res.status(500).json({
      error: "Failed to fetch authors",
    });
  }
});

// Create an author
app.post("/authors", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, email } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim()
    ) {
      return res.status(400).json({
        error: "Name and email are required",
      });
    }

    const author = await prisma.author.create({
      data: {
        authorId: `AUTH-${randomUUID()}`,
        name: name.trim(),
        email: email.trim(),
      },
    });

    return res.status(201).json(author);
  } catch (error) {
    console.error("Failed to create author:", error);

    // PostgreSQL unique constraint violation
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return res.status(409).json({
        error: "An author with this email already exists",
      });
    }

    return res.status(500).json({
      error: "Failed to create author",
    });
  }
});

// Get the authenticated author's dashboard
app.get("/author/dashboard", requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: authReq.user.id,
      },
      include: {
        author: {
          include: {
            books: true,
          },
        },
      },
    });

    if (!user || !user.author) {
      return res.status(404).json({
        error: "No author profile is linked to this account",
      });
    }

    return res.json({
      author: {
        authorId: user.author.authorId,
        name: user.author.name,
        email: user.author.email,
      },
      books: user.author.books,
    });
  } catch (error) {
    console.error("Failed to fetch author dashboard:", error);

    return res.status(500).json({
      error: "Failed to fetch author dashboard",
    });
  }
});

// Get the authenticated user's profile
app.get("/auth/me", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.user) {
    return res.status(401).json({
      error: "Authentication required",
    });
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: authReq.user.id },
      include: { author: { select: { name: true } } },
    });
    if (!user) return res.status(401).json({ error: "User account no longer exists" });
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        authorId: user.authorId ?? undefined,
        name: user.author?.name ?? user.email,
      },
    });
  } catch (error) {
    console.error("Failed to fetch user profile:", error);
    return res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

// Handle unknown routes
app.use((_req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

// Start the server
const server = app.listen(PORT, () => {
  console.log(
    `Author Support Portal API running at http://localhost:${PORT}`
  );
});

// Handle unexpected database pool errors
prisma.$connect().catch((error) => {
  console.error("Failed to connect to the database:", error);
});
// Clean up expired revoked tokens on startup
prisma.revokedToken.deleteMany({
  where: { expiresAt: { lt: new Date() } },
}).then((result) => {
  if (result.count > 0) {
    console.log(`Cleaned up ${result.count} expired revoked token(s).`);
  }
}).catch((error) => {
  console.error("Failed to clean up revoked tokens:", error);
});
// Graceful shutdown
async function shutdown() {
  console.log("Shutting down server...");

  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
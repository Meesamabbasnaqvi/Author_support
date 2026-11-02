import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { ticketReadLimiter } from "../middleware/rateLimits.js";

const router = Router();

// GET /tickets/stats (admin only)
router.get("/stats", requireAuth, requireAdmin, ticketReadLimiter, async (_req, res) => {
  try {
    const [byStatus, byPriority, unassigned] = await Promise.all([
      prisma.ticket.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.ticket.groupBy({
        by: ["priority"],
        where: { status: { not: "CLOSED" } },
        _count: { _all: true },
      }),
      prisma.ticket.count({
        where: { assignedAdminId: null, status: { not: "CLOSED" } },
      }),
    ]);

    return res.json({
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
      byPriority: Object.fromEntries(byPriority.map((r) => [r.priority, r._count._all])),
      unassigned,
    });
  } catch (error) {
    console.error("Failed to compute ticket stats:", error);
    return res.status(500).json({ error: "Failed to compute ticket stats" });
  }
});

export default router;



import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import jwt from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: "AUTHOR" | "ADMIN";
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Authentication required",
    });
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return res.status(500).json({
      error: "Authentication is not configured",
    });
  }

  try {
    const payload = jwt.verify(token, secret);

    if (
      typeof payload === "string" ||
      typeof payload.id !== "number" ||
      typeof payload.email !== "string" ||
      (payload.role !== "AUTHOR" && payload.role !== "ADMIN")
    ) {
      return res.status(401).json({
        error: "Invalid authentication token",
      });
    }

    // Check if this token has been revoked (user logged out)
    const revoked = await prisma.revokedToken.findUnique({
      where: { token },
    });

    if (revoked) {
      return res.status(401).json({
        error: "Token has been revoked. Please log in again.",
      });
    }

    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
    };

    next();
  } catch {
    return res.status(401).json({
      error: "Invalid or expired authentication token",
    });
  }

}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({
      error: "Authentication required",
    });
  }

  if (req.user.role !== "ADMIN") {
    return res.status(403).json({
      error: "Administrator access required",
    });
  }

  next();
}

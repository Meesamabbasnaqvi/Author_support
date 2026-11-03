import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import rateLimit from "express-rate-limit";
import { Resend } from "resend";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";


// 
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const authLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 15,                  // Maximum 15 requests
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later" },
});

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing from .env");
}

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z
    .string()
    .trim()
    .email()
    .transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(72),
});

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(72),
});

// added forgot password so that user can change theri password
const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((v) => v.toLowerCase()),
});

const resetPasswordSchema = z.object({
  token: z.string().trim().min(20),
  password: z.string().min(8).max(72),
});

const resetLimiter = rateLimit({
  windowMs: 20 * 60 * 1000, // 20 minutes
  max: 5,                   // Maximum 5 requests per 20 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password reset attempts, please try again later" },
});
// Register a new author account with rate limiting and input validation.
router.post("/register", authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid registration details",
      ...(process.env.NODE_ENV !== "production" && {
        details: parsed.error.flatten(),
      }),
    });
  }

  const { name, email, password } = parsed.data;

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(409).json({ error: "Email is already registered" });
    }

    const author = await prisma.author.findFirst({
      where: { email },
    });

    if (!author) {
      return res.status(403).json({
        error: "No matching author record exists. Contact an administrator.",
      });
    }

    if (author.name.toLowerCase() !== name.toLowerCase()) {
      return res.status(403).json({
        error: "Name does not match the author record.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: "AUTHOR",
        authorId: author.id,
      },
      select: {
        id: true,
        email: true,
        role: true,
        authorId: true,
        author: { select: { name: true } },
      },
    });

    return res.status(201).json({
      message: "Account created successfully",
      user,
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({ error: "Unable to register account" });
  }
});

// Log in an author or administrator with rate limiting and input validation.
router.post("/login", authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Please provide a valid email and password",
    });
  }

  const { email, password } = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { author: { select: { name: true, phone: true, city: true } } },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }


    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    return res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        authorId: user.authorId ?? undefined,
        name: user.author?.name ?? user.email,
        phone: user.author?.phone ?? null,
        city: user.author?.city ?? null,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Unable to log in" });
  }
});
// Log out — revoke the current token
router.post("/logout", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.slice(7);

  try {
    // Decode token to read its expiry timestamp
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    const expiresAt = new Date((payload.exp ?? 0) * 1000);

    // Save to revoked list
    await prisma.revokedToken.upsert({
      where: { token },
      update: {},
      create: { token, expiresAt },
    });

    return res.json({ message: "Logged out successfully" });
  } catch {
    // If the token is already invalid/expired, consider it logged out
    return res.json({ message: "Logged out successfully" });
  }
});

// Request a password reset link
router.post("/forgot-password", resetLimiter, async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Please provide a valid email address" });
  }

  const { email } = parsed.data;

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    // Always respond with success to prevent email enumeration
    if (!user) {
      // old method anyone can open the linsk and forgot the pass:
      // return res.json({
      //   message: "If an account with that email exists, a password reset link has been sent.",
      // });
      // TO THIS (NEVER expose the link to the browser):
      return res.json({
        message: "If an account with that email exists, a password reset link has been sent.",
      });
    }

    // Clear any previous reset tokens for this email
    await prisma.passwordResetToken.deleteMany({ where: { email } });

    // Generate secure random token (32 bytes = 64 hex characters)
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.passwordResetToken.create({
      data: {
        email,
        token,
        expiresAt,
      },
    });
    const resetLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password?token=${token}`;

    // Send real email via Resend
    if (resend) {
      try {
        await resend.emails.send({
          from: "Author Support <onboarding@resend.dev>",
          to: email,
          subject: "Reset your password - Author Support",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
              <h2 style="color: #0f172a; margin-top: 0;">Password Reset Request</h2>
              <p style="color: #334155; font-size: 15px; line-height: 1.5;">
                We received a request to reset your password for the Author Support Portal.
              </p>
              <div style="margin: 28px 0;">
                <a href="${resetLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
                  Reset Password
                </a>
              </div>
              <p style="color: #64748b; font-size: 13px;">
                This link will expire in <strong>15 minutes</strong>. If you did not request this, you can safely ignore this email.
              </p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="color: #94a3b8; font-size: 12px; word-break: break-all;">
                Or paste this link into your browser: <br/>${resetLink}
              </p>
            </div>
          `,
        });
        console.log(`✉️ Reset email successfully sent via Resend to ${email}`);
      } catch (emailError) {
        console.error("Failed to send email via Resend:", emailError);
      }
    } else {
      console.log(`⚠️ RESEND_API_KEY not configured. Reset link for ${email}: ${resetLink}`);
    }

    return res.json({
      message: "If an account with that email exists, a password reset link has been sent.",
    });
    // comment use old way to cahnge pass
    // console.log("\n=======================================================");
    // console.log(`🔑 PASSWORD RESET LINK for ${email}:`);
    // console.log(resetLink);
    // console.log("=======================================================\n");

    // return res.json({
    //   message: "If an account with that email exists, a password reset link has been sent.",
    //   ...(process.env.NODE_ENV !== "production" && { devResetLink: resetLink }),
    // });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ error: "Unable to process password reset request" });
  }
});

// Reset password using the token
router.post("/reset-password", resetLimiter, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid input. Passwords must be at least 8 characters long.",
    });
  }

  const { token, password } = parsed.data;

  try {
    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetRecord || resetRecord.expiresAt < new Date()) {
      return res.status(400).json({
        error: "This password reset link is invalid or has expired. Please request a new one.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { email: resetRecord.email },
      data: { passwordHash },
    });

    // Delete the token immediately so it can never be used again
    await prisma.passwordResetToken.delete({
      where: { id: resetRecord.id },
    });

    return res.json({
      message: "Your password has been successfully reset. You can now sign in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ error: "Unable to reset password" });
  }
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters").max(72),
});

// Change password for logged-in user (rate-limited)
router.post("/change-password", requireAuth, authLimiter, async (req: AuthenticatedRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  const { currentPassword, newPassword } = parsed.data;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(400).json({ error: "Your current password is incorrect." });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ error: "New password must be different from current password." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Revoke previous token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const oldToken = authHeader.slice(7);
      try {
        const payload = jwt.decode(oldToken) as jwt.JwtPayload | null;
        const expiresAt = new Date((payload?.exp ?? Date.now() / 1000 + 12 * 3600) * 1000);
        await prisma.revokedToken.upsert({
          where: { token: oldToken },
          update: {},
          create: { token: oldToken, expiresAt },
        });
      } catch (err) {
        console.error("Failed to revoke previous token:", err);
      }
    }

    // Issue refreshed token for the updated credentials
    const newToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    return res.json({ message: "Password updated successfully.", token: newToken });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ error: "Unable to change password. Please try again." });
  }
});

export default router;

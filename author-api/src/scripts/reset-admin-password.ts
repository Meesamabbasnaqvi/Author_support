import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";

async function main() {
  const password = process.env.ADMIN_PASSWORD;

  if (!password || password.length < 8) {
    throw new Error("Set ADMIN_PASSWORD to at least 8 characters.");
  }

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, email: true },
  });

  if (admins.length === 0) {
    throw new Error("No admin found in the database this script connects to.");
  }

  console.log("Admin accounts found:");
  console.table(admins);

  if (admins.length > 1) {
    throw new Error("More than one admin found. No password changed.");
  }

  const admin = admins[0];

  if (!admin) {
    throw new Error("No admin account found. No password changed.");
  }
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { id: admin.id },
    data: { passwordHash },
  });

  console.log(`Password reset successfully for ${admin.email}`);
}

main()
  .catch((error: unknown) => {
    console.error("Password reset failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

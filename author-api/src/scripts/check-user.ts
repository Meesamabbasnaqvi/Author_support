
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";

async function main() {
  const email = process.env.CHECK_EMAIL?.trim().toLowerCase();
  const password = process.env.CHECK_PASSWORD;

  if (!email || !password) {
    throw new Error("Set CHECK_EMAIL and CHECK_PASSWORD before running.");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { passwordHash: true },
  });

  if (!user) {
    console.log("User found: false");
    return;
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  console.log("User found: true");
  console.log("Password matches stored hash:", matches);
}

main()
  .catch(() => {
    console.error("Password check failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

const email = process.argv[2]?.trim().toLowerCase();
const password = process.argv[3];

if (!email || !password) {
  throw new Error(
    'Usage: npx tsx src/scripts/set-admin-password.ts "admin@example.com" "new-password"',
  );
}

if (password.length < 8 || password.length > 72) {
  throw new Error("The password must contain between 8 and 72 characters.");
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is missing from .env");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

try {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: "ADMIN",
      authorId: null,
    },
    create: {
      email,
      passwordHash,
      role: "ADMIN",
    },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });

  console.log(`Admin account ready: ${user.email} (${user.role}, id ${user.id})`);
} finally {
  await prisma.$disconnect();
}

import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const password = process.argv[3];

  if (!email || !password) {
    console.log("\n--- Available Users in Database ---");
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        author: { select: { name: true } },
      },
      orderBy: { id: "asc" },
    });
    console.table(
      users.map((u) => ({
        ID: u.id,
        Email: u.email,
        Role: u.role,
        Name: u.author?.name ?? "(No Author Profile)",
      }))
    );
    console.log(
      '\nUsage: npx tsx src/scripts/reset-user-password.ts <email> <new-password>\nExample: npx tsx src/scripts/reset-user-password.ts rohit.kapoor@email.com password123\n'
    );
    return;
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { author: { select: { name: true } } },
  });

  if (!user) {
    throw new Error(`User with email "${email}" not found.`);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  console.log(`\n✅ Password successfully updated for:`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Role:  ${user.role}`);
  console.log(`   Name:  ${user.author?.name ?? "N/A"}`);
  console.log(`   New password: ${password}\n`);
}

main()
  .catch((err) => {
    console.error("❌ Error:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


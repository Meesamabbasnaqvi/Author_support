import { prisma } from "../lib/prisma.js";

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  console.table(users);

  const adminCount = users.filter(
    (user) => user.role === "ADMIN"
  ).length;

  console.log(`Total users: ${users.length}`);
  console.log(`Admin accounts: ${adminCount}`);
}

main()
  .catch((error) => {
    console.error("Unable to check user roles:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
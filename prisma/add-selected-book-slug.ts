import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const columns = await prisma.$queryRaw<Array<{ name: string }>>`PRAGMA table_info("UserPreference")`;
  if (!columns.some((column) => column.name === "selectedBookSlug")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "UserPreference" ADD COLUMN "selectedBookSlug" TEXT`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

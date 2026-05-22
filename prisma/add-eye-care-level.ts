import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("UserPreference")`);
  if (!columns.some((column) => column.name === "eyeCareLevel")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "UserPreference" ADD COLUMN "eyeCareLevel" INTEGER NOT NULL DEFAULT 0`);
    console.log("Added UserPreference.eyeCareLevel");
  } else {
    console.log("UserPreference.eyeCareLevel already exists");
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

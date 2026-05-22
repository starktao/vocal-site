import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const statements = [
  `ALTER TABLE "Word" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'PUBLIC'`,
  `ALTER TABLE "Word" ADD COLUMN "ownerUserId" INTEGER`,
  `ALTER TABLE "Word" ADD COLUMN "insertAfterWordId" INTEGER`,
  `ALTER TABLE "Word" ADD COLUMN "sortKey" REAL NOT NULL DEFAULT 0`,
  `UPDATE "Word" SET "sortKey" = "orderIndex" WHERE "sortKey" = 0`,
  `CREATE INDEX "Word_bookId_sortKey_idx" ON "Word"("bookId", "sortKey")`,
  `CREATE INDEX "Word_bookId_scope_ownerUserId_idx" ON "Word"("bookId", "scope", "ownerUserId")`,
  `CREATE INDEX "Word_insertAfterWordId_idx" ON "Word"("insertAfterWordId")`,
  `CREATE TABLE "UserModelConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'deepseek',
    "baseUrl" TEXT NOT NULL DEFAULT 'https://api.deepseek.com',
    "model" TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
    "encryptedApiKey" TEXT,
    "temperature" REAL NOT NULL DEFAULT 0.4,
    "maxTokens" INTEGER NOT NULL DEFAULT 1800,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserModelConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX "UserModelConfig_userId_key" ON "UserModelConfig"("userId")`,
  `CREATE TABLE "AiChatSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "bookId" INTEGER NOT NULL,
    "wordId" INTEGER NOT NULL,
    "title" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AiChatSession_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "VocabBook" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AiChatSession_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX "AiChatSession_userId_bookId_wordId_key" ON "AiChatSession"("userId", "bookId", "wordId")`,
  `CREATE INDEX "AiChatSession_userId_bookId_idx" ON "AiChatSession"("userId", "bookId")`,
  `CREATE TABLE "AiChatMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX "AiChatMessage_sessionId_createdAt_idx" ON "AiChatMessage"("sessionId", "createdAt")`,
  `CREATE TABLE "UserWordExplanationOverride" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "bookId" INTEGER NOT NULL,
    "wordId" INTEGER NOT NULL,
    "explanationJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserWordExplanationOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserWordExplanationOverride_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "VocabBook" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserWordExplanationOverride_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX "UserWordExplanationOverride_userId_wordId_key" ON "UserWordExplanationOverride"("userId", "wordId")`,
  `CREATE INDEX "UserWordExplanationOverride_userId_bookId_idx" ON "UserWordExplanationOverride"("userId", "bookId")`
];

async function columnExists(table: string, column: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${table}")`);
  return rows.some((row) => row.name === column);
}

async function tableExists(table: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    table
  );
  return rows.length > 0;
}

async function indexExists(index: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type='index' AND name=?`,
    index
  );
  return rows.length > 0;
}

async function shouldSkip(statement: string) {
  if (statement.includes(`ALTER TABLE "Word" ADD COLUMN "scope"`)) return columnExists("Word", "scope");
  if (statement.includes(`ALTER TABLE "Word" ADD COLUMN "ownerUserId"`)) return columnExists("Word", "ownerUserId");
  if (statement.includes(`ALTER TABLE "Word" ADD COLUMN "insertAfterWordId"`)) return columnExists("Word", "insertAfterWordId");
  if (statement.includes(`ALTER TABLE "Word" ADD COLUMN "sortKey"`)) return columnExists("Word", "sortKey");

  const tableMatch = statement.match(/CREATE TABLE "([^"]+)"/);
  if (tableMatch) return tableExists(tableMatch[1]);

  const indexMatch = statement.match(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/);
  if (indexMatch) return indexExists(indexMatch[1]);

  return false;
}

async function main() {
  for (const statement of statements) {
    if (await shouldSkip(statement)) continue;
    await prisma.$executeRawUnsafe(statement);
  }
  console.log("AI feature schema is ready.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

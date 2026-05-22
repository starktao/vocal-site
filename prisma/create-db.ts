import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const dbPath = path.join(process.cwd(), "prisma", "dev.db");

for (const file of [dbPath, `${dbPath}-journal`]) {
  if (fs.existsSync(file)) fs.rmSync(file);
}

const prisma = new PrismaClient();

const statements = [
  `PRAGMA foreign_keys = ON`,
  `CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE "VocabBook" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE "Word" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bookId" INTEGER NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "sortKey" REAL NOT NULL DEFAULT 0,
    "word" TEXT NOT NULL,
    "phonetic" TEXT,
    "meaningText" TEXT NOT NULL,
    "explanationJson" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'PUBLIC',
    "ownerUserId" INTEGER,
    "insertAfterWordId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Word_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "VocabBook" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE "UserPreference" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "accent" TEXT NOT NULL DEFAULT 'en-US',
    "soundMode" TEXT NOT NULL DEFAULT 'auto',
    "progressFilter" TEXT NOT NULL DEFAULT 'all',
    "eyeCareLevel" INTEGER NOT NULL DEFAULT 0,
    "selectedBookSlug" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE "UserWordProgress" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "wordId" INTEGER NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserWordProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserWordProgress_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE "UserWordFavorite" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "wordId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserWordFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserWordFavorite_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE "UserBookmark" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "bookId" INTEGER NOT NULL,
    "page" INTEGER NOT NULL DEFAULT 1,
    "wordId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserBookmark_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "VocabBook" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserBookmark_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE "UserLastPosition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "bookId" INTEGER NOT NULL,
    "page" INTEGER NOT NULL DEFAULT 1,
    "wordId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserLastPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserLastPosition_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "VocabBook" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserLastPosition_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
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
  `CREATE TABLE "AiChatMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
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
  `CREATE UNIQUE INDEX "User_username_key" ON "User"("username")`,
  `CREATE UNIQUE INDEX "User_email_key" ON "User"("email")`,
  `CREATE UNIQUE INDEX "VocabBook_slug_key" ON "VocabBook"("slug")`,
  `CREATE INDEX "Word_bookId_word_idx" ON "Word"("bookId", "word")`,
  `CREATE INDEX "Word_bookId_sortKey_idx" ON "Word"("bookId", "sortKey")`,
  `CREATE INDEX "Word_bookId_scope_ownerUserId_idx" ON "Word"("bookId", "scope", "ownerUserId")`,
  `CREATE INDEX "Word_insertAfterWordId_idx" ON "Word"("insertAfterWordId")`,
  `CREATE UNIQUE INDEX "Word_bookId_orderIndex_key" ON "Word"("bookId", "orderIndex")`,
  `CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId")`,
  `CREATE INDEX "UserWordProgress_userId_idx" ON "UserWordProgress"("userId")`,
  `CREATE UNIQUE INDEX "UserWordProgress_userId_wordId_key" ON "UserWordProgress"("userId", "wordId")`,
  `CREATE INDEX "UserWordFavorite_userId_idx" ON "UserWordFavorite"("userId")`,
  `CREATE UNIQUE INDEX "UserWordFavorite_userId_wordId_key" ON "UserWordFavorite"("userId", "wordId")`,
  `CREATE UNIQUE INDEX "UserBookmark_userId_bookId_key" ON "UserBookmark"("userId", "bookId")`,
  `CREATE UNIQUE INDEX "UserLastPosition_userId_bookId_key" ON "UserLastPosition"("userId", "bookId")`,
  `CREATE UNIQUE INDEX "UserModelConfig_userId_key" ON "UserModelConfig"("userId")`,
  `CREATE UNIQUE INDEX "AiChatSession_userId_bookId_wordId_key" ON "AiChatSession"("userId", "bookId", "wordId")`,
  `CREATE INDEX "AiChatSession_userId_bookId_idx" ON "AiChatSession"("userId", "bookId")`,
  `CREATE INDEX "AiChatMessage_sessionId_createdAt_idx" ON "AiChatMessage"("sessionId", "createdAt")`,
  `CREATE UNIQUE INDEX "UserWordExplanationOverride_userId_wordId_key" ON "UserWordExplanationOverride"("userId", "wordId")`,
  `CREATE INDEX "UserWordExplanationOverride_userId_bookId_idx" ON "UserWordExplanationOverride"("userId", "bookId")`
];

async function main() {
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  console.log(`Created SQLite schema at ${dbPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

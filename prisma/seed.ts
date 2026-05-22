import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();

type Explanation = {
  id?: number;
  word: string;
  phonetic?: string;
  meaning?: { partOfSpeech?: string; text?: string } | string;
  roots?: unknown[];
  memory?: string;
  associations?: unknown[];
  collocations?: string[];
};

function meaningText(item: Explanation) {
  if (typeof item.meaning === "string") return item.meaning;
  const pos = item.meaning?.partOfSpeech || "";
  const text = item.meaning?.text || "";
  return `${pos} ${text}`.trim();
}

function cleanWord(explanationWord: string | undefined, cardWord: string) {
  const word = String(explanationWord || "").trim();
  if (!word || word.includes('"') || word.includes("{") || word.includes(":")) return cardWord;
  return word;
}

async function main() {
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123456";
  const dataPath = path.join(process.cwd(), "data", "word_explanations.json");
  const cardDataPath = path.join(process.cwd(), "data", "vocab_cards.json");
  const raw = await fs.readFile(dataPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, Explanation> | Explanation[];
  const cardRaw = await fs.readFile(cardDataPath, "utf8").catch(() => "[]");
  const cardItems = JSON.parse(cardRaw) as Array<{ id?: number; word: string; phonetic?: string; meaning?: string }>;
  const cardByWord = new Map(cardItems.map((item) => [item.word.trim().toLowerCase(), item]));
  const explanationById = new Map(
    (Array.isArray(parsed) ? parsed : Object.values(parsed))
      .filter((item) => item.id)
      .map((item) => [Number(item.id), item])
  );
  const items = cardItems.length
    ? cardItems.map((card, index) => ({
        ...(explanationById.get(Number(card.id || index + 1)) || { word: card.word }),
        id: Number(card.id || index + 1),
        word: cleanWord(explanationById.get(Number(card.id || index + 1))?.word, card.word),
        phonetic: card.phonetic || "",
        meaning: explanationById.get(Number(card.id || index + 1))?.meaning || card.meaning || ""
      }))
    : (Array.isArray(parsed) ? parsed : Object.values(parsed))
    .filter((item) => item.word)
    .sort((a, b) => Number(a.id || 0) - Number(b.id || 0));

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await prisma.user.upsert({
    where: { username: adminUsername },
    update: { role: "ADMIN", passwordHash },
    create: { username: adminUsername, passwordHash, role: "ADMIN" }
  });

  const book = await prisma.vocabBook.upsert({
    where: { slug: "ielts-vocab-3638" },
    update: {
      title: "雅思词汇真经 3638",
      description: "3638 个完整解释单词"
    },
    create: {
      title: "雅思词汇真经 3638",
      slug: "ielts-vocab-3638",
      description: "3638 个完整解释单词"
    }
  });

  await prisma.userLastPosition.deleteMany({ where: { bookId: book.id } });
  await prisma.userBookmark.deleteMany({ where: { bookId: book.id } });
  await prisma.userWordFavorite.deleteMany({
    where: { word: { bookId: book.id } }
  });
  await prisma.userWordProgress.deleteMany({
    where: { word: { bookId: book.id } }
  });
  await prisma.word.deleteMany({ where: { bookId: book.id } });

  for (const [index, item] of items.entries()) {
    await prisma.word.create({
      data: {
        bookId: book.id,
        orderIndex: index + 1,
        sortKey: index + 1,
        word: item.word,
        phonetic: item.phonetic || cardByWord.get(item.word.trim().toLowerCase())?.phonetic || "",
        meaningText: meaningText(item),
        explanationJson: JSON.stringify(item)
      }
    });
  }

  console.log(`Seeded ${items.length} words and admin user "${adminUsername}".`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

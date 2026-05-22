import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();

type WordItem = {
  id?: number;
  word: string;
  phonetic?: string;
  meaning?: string;
  sourceSheet?: string;
};

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

function meaningText(item: Explanation, fallback = "") {
  if (typeof item.meaning === "string") return item.meaning || fallback;
  const pos = item.meaning?.partOfSpeech || "";
  const text = item.meaning?.text || fallback;
  return `${pos} ${text}`.trim();
}

async function main() {
  const root = path.resolve(process.cwd(), "..");
  const wordsPath = path.join(root, "corpus_3_4_5_11_words.json");
  const explanationsPath = path.join(root, "corpus_3_4_5_11_explanations.json");
  const words = JSON.parse(await fs.readFile(wordsPath, "utf8")) as WordItem[];
  const explanationsRaw = JSON.parse(await fs.readFile(explanationsPath, "utf8")) as Record<string, Explanation> | Explanation[];
  const explanations = Array.isArray(explanationsRaw) ? explanationsRaw : Object.values(explanationsRaw);
  const explanationById = new Map(explanations.filter((item) => item.id).map((item) => [Number(item.id), item]));
  const explanationByWord = new Map(explanations.map((item) => [item.word.trim().toLowerCase(), item]));

  const book = await prisma.vocabBook.upsert({
    where: { slug: "corpus-3-4-5-11" },
    update: {
      title: "剑20语料库 3/4/5/11",
      description: "语料库自批改表格中 3、4、5、11 的词汇"
    },
    create: {
      title: "剑20语料库 3/4/5/11",
      slug: "corpus-3-4-5-11",
      description: "语料库自批改表格中 3、4、5、11 的词汇"
    }
  });

  await prisma.userLastPosition.deleteMany({ where: { bookId: book.id } });
  await prisma.userBookmark.deleteMany({ where: { bookId: book.id } });
  await prisma.userWordFavorite.deleteMany({ where: { word: { bookId: book.id } } });
  await prisma.userWordProgress.deleteMany({ where: { word: { bookId: book.id } } });
  await prisma.word.deleteMany({ where: { bookId: book.id } });

  for (const [index, wordItem] of words.entries()) {
    const explanation = explanationById.get(Number(wordItem.id || index + 1))
      || explanationByWord.get(wordItem.word.trim().toLowerCase())
      || { id: wordItem.id || index + 1, word: wordItem.word, meaning: wordItem.meaning || "" };
    const normalized: Explanation = {
      ...explanation,
      id: wordItem.id || explanation.id || index + 1,
      word: wordItem.word,
      phonetic: wordItem.phonetic || explanation.phonetic || ""
    };

    await prisma.word.create({
      data: {
        bookId: book.id,
        orderIndex: index + 1,
        sortKey: index + 1,
        word: wordItem.word,
        phonetic: wordItem.phonetic || explanation.phonetic || "",
        meaningText: meaningText(normalized, wordItem.meaning || ""),
        explanationJson: JSON.stringify(normalized)
      }
    });
  }

  console.log(`Imported ${words.length} words into "${book.title}".`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

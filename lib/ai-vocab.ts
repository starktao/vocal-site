import type { Word } from "@prisma/client";
import { parseExplanationJson } from "@/lib/explanation";
import { prisma } from "@/lib/prisma";

export async function getAccessibleWord(userId: number, bookSlug: string | undefined | null, wordId: number) {
  const book = await prisma.vocabBook.findUnique({
    where: { slug: bookSlug || "" },
    select: { id: true, slug: true, title: true }
  });
  if (!book) return null;
  const word = await prisma.word.findFirst({
    where: {
      id: wordId,
      bookId: book.id,
      OR: [
        { scope: "PUBLIC" },
        { scope: "PRIVATE", ownerUserId: userId }
      ]
    }
  });
  if (!word) return null;
  return { book, word };
}

export async function getEffectiveExplanation(userId: number, bookId: number, word: Word) {
  const override = await prisma.userWordExplanationOverride.findUnique({
    where: { userId_wordId: { userId, wordId: word.id } },
    select: { explanationJson: true }
  });
  return parseExplanationJson(override?.explanationJson || word.explanationJson, word.word, word.meaningText);
}

export async function getOrCreateAiSession(userId: number, bookId: number, wordId: number, title?: string) {
  return prisma.aiChatSession.upsert({
    where: { userId_bookId_wordId: { userId, bookId, wordId } },
    update: { title },
    create: { userId, bookId, wordId, title }
  });
}

export async function getRecentMessages(sessionId: number, take = 12) {
  const messages = await prisma.aiChatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take
  });
  return messages.reverse().map((message) => ({
    role: message.role,
    content: message.content,
    createdAt: message.createdAt
  }));
}

import { requireUser } from "@/lib/auth";
import { getBookWords } from "@/lib/vocab";
import { prisma } from "@/lib/prisma";
import { VocabApp } from "@/components/VocabApp";

export default async function LearnPage() {
  const user = await requireUser();
  const { book, words } = await getBookWords();
  const [preferences, progressRows, favoriteRows, lastPosition] = await Promise.all([
    prisma.userPreference.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id }
    }),
    prisma.userWordProgress.findMany({
      where: { userId: user.id, word: { bookId: book.id } },
      select: { wordId: true, viewCount: true }
    }),
    prisma.userWordFavorite.findMany({
      where: { userId: user.id, word: { bookId: book.id } },
      select: { wordId: true }
    }),
    prisma.userLastPosition.findUnique({
      where: { userId_bookId: { userId: user.id, bookId: book.id } },
      select: { page: true, wordId: true }
    })
  ]);

  return (
    <VocabApp
      initialData={{
        user,
        book,
        words: words.map((word) => ({
          id: word.id,
          orderIndex: word.orderIndex,
          word: word.word,
          phonetic: word.phonetic || "",
          meaning: word.meaningText,
          explanation: JSON.parse(word.explanationJson)
        })),
        state: {
          preferences: {
            accent: preferences.accent,
            soundMode: preferences.soundMode,
            progressFilter: preferences.progressFilter,
            eyeCareLevel: preferences.eyeCareLevel
          },
          progress: Object.fromEntries(progressRows.map((row) => [row.wordId, row.viewCount])),
          favorites: favoriteRows.map((row) => row.wordId),
          lastPosition
        }
      }}
    />
  );
}

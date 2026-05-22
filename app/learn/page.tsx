import { requireUser } from "@/lib/auth";
import { parseExplanationJson } from "@/lib/explanation";
import { getAllBooks, getUserBookWords, resolveBookSlug } from "@/lib/vocab";
import { prisma } from "@/lib/prisma";
import { VocabApp } from "@/components/VocabApp";

export default async function LearnPage({ searchParams }: { searchParams?: Promise<{ book?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const preferences = await prisma.userPreference.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id }
  });
  const bookSlug = await resolveBookSlug(params?.book, preferences.selectedBookSlug);
  const [{ book, words }, books] = await Promise.all([
    getUserBookWords(user.id, bookSlug),
    getAllBooks()
  ]);
  const [progressRows, favoriteRows, lastPosition, overrides] = await Promise.all([
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
    }),
    prisma.userWordExplanationOverride.findMany({
      where: { userId: user.id, bookId: book.id },
      select: { wordId: true, explanationJson: true }
    })
  ]);
  const overrideByWordId = new Map(overrides.map((item) => [item.wordId, item.explanationJson]));

  await prisma.userPreference.upsert({
    where: { userId: user.id },
    update: { selectedBookSlug: book.slug },
    create: { userId: user.id, selectedBookSlug: book.slug }
  });

  return (
    <VocabApp
      key={book.slug}
      initialData={{
        user,
        book,
        books,
        words: words.map((word) => ({
          id: word.id,
          orderIndex: word.orderIndex,
          word: word.word,
          phonetic: word.phonetic || "",
          meaning: word.meaningText,
          explanation: parseExplanationJson(overrideByWordId.get(word.id) || word.explanationJson, word.word, word.meaningText),
          isPrivate: word.scope === "PRIVATE"
        })),
        state: {
          preferences: {
            accent: preferences.accent,
            soundMode: preferences.soundMode,
            progressFilter: preferences.progressFilter,
            eyeCareLevel: preferences.eyeCareLevel,
            selectedBookSlug: book.slug
          },
          progress: Object.fromEntries(progressRows.map((row) => [row.wordId, row.viewCount])),
          favorites: favoriteRows.map((row) => row.wordId),
          lastPosition
        }
      }}
    />
  );
}

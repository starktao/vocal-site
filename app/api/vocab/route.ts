import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getAllBooks, getBookWords, resolveBookSlug } from "@/lib/vocab";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { user, response } = await requireApiUser(request);
  if (!user) return response;

  const preferences = await prisma.userPreference.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id }
  });
  const bookSlug = await resolveBookSlug(request.nextUrl.searchParams.get("book"), preferences.selectedBookSlug);
  const { book, words } = await getBookWords(bookSlug);
  const [books, progressRows, favoriteRows, lastPosition] = await Promise.all([
    getAllBooks(),
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

  await prisma.userPreference.upsert({
    where: { userId: user.id },
    update: { selectedBookSlug: book.slug },
    create: { userId: user.id, selectedBookSlug: book.slug }
  });

  return NextResponse.json({
    user,
    book,
    books,
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
        eyeCareLevel: preferences.eyeCareLevel,
        selectedBookSlug: book.slug
      },
      progress: Object.fromEntries(progressRows.map((row) => [row.wordId, row.viewCount])),
      favorites: favoriteRows.map((row) => row.wordId),
      lastPosition
    }
  });
}

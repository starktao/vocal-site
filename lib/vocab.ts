import { prisma } from "@/lib/prisma";

export const DEFAULT_BOOK_SLUG = "ielts-vocab-3638";

const bookSelect = {
  id: true,
  title: true,
  slug: true,
  description: true
} as const;

export async function getAllBooks() {
  return prisma.vocabBook.findMany({
    orderBy: { id: "asc" },
    select: bookSelect
  });
}

export async function getDefaultBook() {
  const book = await prisma.vocabBook.findUnique({
    where: { slug: DEFAULT_BOOK_SLUG },
    select: bookSelect
  });
  if (!book) throw new Error("Default vocabulary book has not been seeded.");
  return book;
}

export async function getBookBySlug(slug: string | undefined | null) {
  const safeSlug = slug || DEFAULT_BOOK_SLUG;
  const book = await prisma.vocabBook.findUnique({
    where: { slug: safeSlug },
    select: bookSelect
  });
  if (book) return book;
  return getDefaultBook();
}

export async function getBookWords(slug?: string | null) {
  const book = await getBookBySlug(slug);
  const words = await prisma.word.findMany({
    where: { bookId: book.id, scope: "PUBLIC" },
    orderBy: { orderIndex: "asc" }
  });
  return { book, words };
}

export async function getUserBookWords(userId: number, slug?: string | null) {
  const book = await getBookBySlug(slug);
  const words = await prisma.word.findMany({
    where: {
      bookId: book.id,
      OR: [
        { scope: "PUBLIC" },
        { scope: "PRIVATE", ownerUserId: userId }
      ]
    },
    orderBy: [
      { sortKey: "asc" },
      { id: "asc" }
    ]
  });
  return { book, words };
}

export async function resolveBookSlug(requestedSlug?: string | null, selectedSlug?: string | null) {
  const requested = requestedSlug?.trim();
  if (requested) {
    const book = await prisma.vocabBook.findUnique({ where: { slug: requested }, select: { slug: true } });
    if (book) return book.slug;
  }
  const selected = selectedSlug?.trim();
  if (selected) {
    const book = await prisma.vocabBook.findUnique({ where: { slug: selected }, select: { slug: true } });
    if (book) return book.slug;
  }
  return DEFAULT_BOOK_SLUG;
}

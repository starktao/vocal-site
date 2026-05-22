import { prisma } from "@/lib/prisma";

export async function getDefaultBook() {
  const book = await prisma.vocabBook.findUnique({
    where: { slug: "ielts-vocab-3638" }
  });
  if (!book) throw new Error("Default vocabulary book has not been seeded.");
  return book;
}

export async function getBookWords() {
  const book = await getDefaultBook();
  const words = await prisma.word.findMany({
    where: { bookId: book.id },
    orderBy: { orderIndex: "asc" }
  });
  return { book, words };
}

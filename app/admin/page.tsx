import { requireAdmin } from "@/lib/auth";
import { getAllBooks, getBookWords, resolveBookSlug } from "@/lib/vocab";
import { prisma } from "@/lib/prisma";
import { AdminWordManager } from "@/components/AdminWordManager";

export default async function AdminPage({ searchParams }: { searchParams?: Promise<{ book?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const bookSlug = await resolveBookSlug(params?.book);
  const [{ book, words }, books] = await Promise.all([
    getBookWords(bookSlug),
    getAllBooks()
  ]);
  const [users, progressRows] = await Promise.all([
    prisma.user.count(),
    prisma.userWordProgress.count({ where: { word: { bookId: book.id } } })
  ]);

  return (
    <AdminWordManager
      book={book}
      books={books}
      words={words.map((word) => ({
        id: word.id,
        orderIndex: word.orderIndex,
        word: word.word,
        phonetic: word.phonetic || "",
        meaning: word.meaningText,
        explanation: JSON.parse(word.explanationJson)
      }))}
      stats={{ users, progressRows, wordCount: words.length }}
    />
  );
}

import { requireAdmin } from "@/lib/auth";
import { getBookWords } from "@/lib/vocab";
import { prisma } from "@/lib/prisma";
import { AdminWordManager } from "@/components/AdminWordManager";

export default async function AdminPage() {
  await requireAdmin();
  const { words } = await getBookWords();
  const [users, progressRows] = await Promise.all([
    prisma.user.count(),
    prisma.userWordProgress.count()
  ]);

  return (
    <AdminWordManager
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

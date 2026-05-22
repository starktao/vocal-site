import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBookBySlug } from "@/lib/vocab";

const schema = z.object({
  wordId: z.number().int().positive(),
  increment: z.boolean().default(true),
  bookSlug: z.string().min(1).optional()
});

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser(request);
  if (!user) return response;

  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const book = await getBookBySlug(body.data.bookSlug);
  const word = await prisma.word.findFirst({
    where: { id: body.data.wordId, bookId: book.id },
    select: { id: true }
  });
  if (!word) return NextResponse.json({ error: "Word not found in book" }, { status: 404 });

  const progress = await prisma.userWordProgress.upsert({
    where: { userId_wordId: { userId: user.id, wordId: body.data.wordId } },
    update: {
      viewCount: body.data.increment ? { increment: 1 } : undefined,
      lastViewedAt: new Date()
    },
    create: {
      userId: user.id,
      wordId: body.data.wordId,
      viewCount: body.data.increment ? 1 : 0,
      lastViewedAt: new Date()
    }
  });

  return NextResponse.json({ wordId: progress.wordId, viewCount: progress.viewCount });
}

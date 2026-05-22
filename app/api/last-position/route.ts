import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBookBySlug } from "@/lib/vocab";

const schema = z.object({
  page: z.number().int().positive(),
  wordId: z.number().int().positive().nullable().optional(),
  bookSlug: z.string().min(1).optional()
});

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser(request);
  if (!user) return response;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const book = await getBookBySlug(body.data.bookSlug);
  if (body.data.wordId) {
    const word = await prisma.word.findFirst({
      where: { id: body.data.wordId, bookId: book.id },
      select: { id: true }
    });
    if (!word) return NextResponse.json({ error: "Word not found in book" }, { status: 404 });
  }
  const position = await prisma.userLastPosition.upsert({
    where: { userId_bookId: { userId: user.id, bookId: book.id } },
    update: { page: body.data.page, wordId: body.data.wordId ?? null },
    create: { userId: user.id, bookId: book.id, page: body.data.page, wordId: body.data.wordId ?? null }
  });
  return NextResponse.json({ page: position.page, wordId: position.wordId });
}

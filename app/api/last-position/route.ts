import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultBook } from "@/lib/vocab";

const schema = z.object({
  page: z.number().int().positive(),
  wordId: z.number().int().positive().nullable().optional()
});

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser(request);
  if (!user) return response;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const book = await getDefaultBook();
  const position = await prisma.userLastPosition.upsert({
    where: { userId_bookId: { userId: user.id, bookId: book.id } },
    update: { page: body.data.page, wordId: body.data.wordId ?? null },
    create: { userId: user.id, bookId: book.id, page: body.data.page, wordId: body.data.wordId ?? null }
  });
  return NextResponse.json({ page: position.page, wordId: position.wordId });
}

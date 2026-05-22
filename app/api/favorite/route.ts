import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  wordId: z.number().int().positive(),
  favorite: z.boolean().optional()
});

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser(request);
  if (!user) return response;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const word = await prisma.word.findUnique({
    where: { id: body.data.wordId },
    select: { id: true }
  });
  if (!word) return NextResponse.json({ error: "Word not found" }, { status: 404 });

  const existing = await prisma.userWordFavorite.findUnique({
    where: { userId_wordId: { userId: user.id, wordId: body.data.wordId } }
  });
  const nextFavorite = body.data.favorite ?? !existing;

  if (nextFavorite && !existing) {
    await prisma.userWordFavorite.create({
      data: { userId: user.id, wordId: body.data.wordId }
    });
  }
  if (!nextFavorite && existing) {
    await prisma.userWordFavorite.delete({
      where: { userId_wordId: { userId: user.id, wordId: body.data.wordId } }
    });
  }

  return NextResponse.json({ wordId: body.data.wordId, favorite: nextFavorite });
}

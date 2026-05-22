import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  wordId: z.number().int().positive(),
  increment: z.boolean().default(true)
});

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser(request);
  if (!user) return response;

  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

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

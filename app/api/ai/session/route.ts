import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getAccessibleWord, getOrCreateAiSession } from "@/lib/ai-vocab";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { user, response } = await requireApiUser(request);
  if (!user) return response;

  const bookSlug = request.nextUrl.searchParams.get("book");
  const wordId = Number(request.nextUrl.searchParams.get("wordId"));
  if (!bookSlug || !Number.isInteger(wordId)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const target = await getAccessibleWord(user.id, bookSlug, wordId);
  if (!target) return NextResponse.json({ error: "Word not found" }, { status: 404 });

  const session = await getOrCreateAiSession(user.id, target.book.id, target.word.id, target.word.word);
  const messages = await prisma.aiChatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
    take: 80
  });

  return NextResponse.json({
    sessionId: session.id,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt.toISOString()
    }))
  });
}

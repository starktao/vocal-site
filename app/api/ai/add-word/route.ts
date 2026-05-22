import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { callChatModel, getOrCreateModelConfig, parseJsonObject } from "@/lib/ai";
import { addWordPrompt } from "@/lib/ai-prompts";
import { getAccessibleWord, getOrCreateAiSession, getRecentMessages } from "@/lib/ai-vocab";
import { requireApiUser } from "@/lib/auth";
import { explanationMeaningText, normalizeExplanation } from "@/lib/explanation";
import { prisma } from "@/lib/prisma";

const previewSchema = z.object({
  bookSlug: z.string().min(1),
  wordId: z.number().int().positive()
});

const candidateSchema = z.object({
  word: z.string().min(1),
  phonetic: z.string().optional(),
  meaningText: z.string().min(1),
  reason: z.string().optional(),
  explanation: z.unknown()
});

const confirmSchema = z.object({
  bookSlug: z.string().min(1),
  wordId: z.number().int().positive(),
  candidate: candidateSchema
});

function normalizeWordKey(value: string) {
  return value.trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser(request);
  if (!user) return response;
  const body = previewSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const target = await getAccessibleWord(user.id, body.data.bookSlug, body.data.wordId);
  if (!target) return NextResponse.json({ error: "Word not found" }, { status: 404 });

  try {
    const config = await getOrCreateModelConfig(user.id);
    const session = await getOrCreateAiSession(user.id, target.book.id, target.word.id, target.word.word);
    const recentMessages = await getRecentMessages(session.id, 12);
    if (!recentMessages.length) {
      return NextResponse.json({ status: "no_candidate", reason: "还没有可判断的 AI 对话。" });
    }
    const bookWords = await prisma.word.findMany({
      where: {
        bookId: target.book.id,
        OR: [
          { scope: "PUBLIC" },
          { scope: "PRIVATE", ownerUserId: user.id }
        ]
      },
      select: { word: true }
    });
    const content = await callChatModel(config, [
      { role: "system", content: "你只返回有效 JSON。" },
      { role: "user", content: addWordPrompt({ word: target.word.word, bookWords: bookWords.map((item) => item.word), recentMessages }) }
    ], { json: true, maxTokens: Math.max(2200, config.maxTokens) });
    const parsed = parseJsonObject(content) as { status?: string; reason?: string; summary?: string; candidates?: unknown[] };
    if (parsed.status !== "ok" || !Array.isArray(parsed.candidates) || !parsed.candidates.length) {
      return NextResponse.json({ status: "no_candidate", reason: parsed.reason || "没有发现适合增添的新词。" });
    }
    const existing = new Set(bookWords.map((item) => normalizeWordKey(item.word)));
    existing.add(normalizeWordKey(target.word.word));
    const candidates = parsed.candidates.map((item) => {
      const raw = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const explanation = normalizeExplanation(raw.explanation, String(raw.word || ""), String(raw.meaningText || ""));
      return {
        word: String(raw.word || explanation.word || "").trim(),
        phonetic: String(raw.phonetic || "").trim(),
        meaningText: String(raw.meaningText || explanationMeaningText(explanation, "") || "").trim(),
        reason: String(raw.reason || "").trim(),
        explanation
      };
    }).filter((candidate) => candidate.word && candidate.meaningText && !existing.has(normalizeWordKey(candidate.word))).slice(0, 3);

    if (!candidates.length) {
      return NextResponse.json({ status: "no_candidate", reason: "候选词已经在当前词书中，或不适合加入。" });
    }

    return NextResponse.json({ status: "ok", summary: parsed.summary || "发现可增添的新词。", candidates });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "生成新词预览失败" }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireApiUser(request);
  if (!user) return response;
  const body = confirmSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const target = await getAccessibleWord(user.id, body.data.bookSlug, body.data.wordId);
  if (!target) return NextResponse.json({ error: "Word not found" }, { status: 404 });

  const wordKey = normalizeWordKey(body.data.candidate.word);
  const existing = await prisma.word.findFirst({
    where: {
      bookId: target.book.id,
      word: { equals: body.data.candidate.word },
      OR: [
        { scope: "PUBLIC" },
        { scope: "PRIVATE", ownerUserId: user.id }
      ]
    },
    select: { id: true }
  });
  if (existing || wordKey === normalizeWordKey(target.word.word)) {
    return NextResponse.json({ error: "这个词已经在当前词书中。" }, { status: 409 });
  }

  const nextWord = await prisma.word.findFirst({
    where: {
      bookId: target.book.id,
      sortKey: { gt: target.word.sortKey },
      OR: [
        { scope: "PUBLIC" },
        { scope: "PRIVATE", ownerUserId: user.id }
      ]
    },
    orderBy: [{ sortKey: "asc" }, { id: "asc" }],
    select: { sortKey: true }
  });
  const nextOrder = await prisma.word.aggregate({
    where: { bookId: target.book.id },
    _max: { orderIndex: true }
  });
  const explanation = normalizeExplanation(body.data.candidate.explanation, body.data.candidate.word, body.data.candidate.meaningText);
  const sortKey = nextWord ? (target.word.sortKey + nextWord.sortKey) / 2 : target.word.sortKey + 0.001;
  const created = await prisma.word.create({
    data: {
      bookId: target.book.id,
      orderIndex: (nextOrder._max.orderIndex || 0) + 1,
      sortKey,
      word: body.data.candidate.word.trim(),
      phonetic: body.data.candidate.phonetic || "",
      meaningText: body.data.candidate.meaningText,
      explanationJson: JSON.stringify(explanation),
      scope: "PRIVATE",
      ownerUserId: user.id,
      insertAfterWordId: target.word.id
    }
  });

  return NextResponse.json({
    ok: true,
    word: {
      id: created.id,
      orderIndex: created.orderIndex,
      word: created.word,
      phonetic: created.phonetic || "",
      meaning: created.meaningText,
      explanation,
      isPrivate: true
    }
  });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { callChatModel, getOrCreateModelConfig, parseJsonObject } from "@/lib/ai";
import { updateExplanationPrompt } from "@/lib/ai-prompts";
import { getAccessibleWord, getEffectiveExplanation, getOrCreateAiSession, getRecentMessages } from "@/lib/ai-vocab";
import { requireApiUser } from "@/lib/auth";
import { explanationMeaningText, normalizeExplanation } from "@/lib/explanation";
import { prisma } from "@/lib/prisma";

const previewSchema = z.object({
  bookSlug: z.string().min(1),
  wordId: z.number().int().positive()
});

const confirmSchema = z.object({
  bookSlug: z.string().min(1),
  wordId: z.number().int().positive(),
  explanation: z.unknown()
});

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
      return NextResponse.json({ status: "no_update", reason: "还没有可整理的 AI 对话。" });
    }
    const currentExplanation = await getEffectiveExplanation(user.id, target.book.id, target.word);
    const content = await callChatModel(config, [
      { role: "system", content: "你只返回有效 JSON。" },
      { role: "user", content: updateExplanationPrompt({ word: target.word.word, currentExplanation, recentMessages }) }
    ], { json: true, maxTokens: Math.max(1800, config.maxTokens) });
    const parsed = parseJsonObject(content) as { status?: string; reason?: string; summary?: string; explanation?: unknown };
    if (parsed.status !== "ok" || !parsed.explanation) {
      return NextResponse.json({ status: "no_update", reason: parsed.reason || "没有发现适合更新的内容。" });
    }
    const explanation = normalizeExplanation(parsed.explanation, target.word.word, target.word.meaningText);
    return NextResponse.json({
      status: "ok",
      summary: parsed.summary || "已整理出可更新内容。",
      explanation,
      meaningText: explanationMeaningText(explanation, target.word.meaningText)
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "生成更新预览失败" }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireApiUser(request);
  if (!user) return response;
  const body = confirmSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const target = await getAccessibleWord(user.id, body.data.bookSlug, body.data.wordId);
  if (!target) return NextResponse.json({ error: "Word not found" }, { status: 404 });

  const explanation = normalizeExplanation(body.data.explanation, target.word.word, target.word.meaningText);
  await prisma.userWordExplanationOverride.upsert({
    where: { userId_wordId: { userId: user.id, wordId: target.word.id } },
    update: {
      bookId: target.book.id,
      explanationJson: JSON.stringify(explanation)
    },
    create: {
      userId: user.id,
      bookId: target.book.id,
      wordId: target.word.id,
      explanationJson: JSON.stringify(explanation)
    }
  });

  return NextResponse.json({
    ok: true,
    wordId: target.word.id,
    explanation,
    meaningText: explanationMeaningText(explanation, target.word.meaningText)
  });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createChatStream, getOrCreateModelConfig } from "@/lib/ai";
import { chatSystemPrompt } from "@/lib/ai-prompts";
import { getAccessibleWord, getEffectiveExplanation, getOrCreateAiSession, getRecentMessages } from "@/lib/ai-vocab";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  bookSlug: z.string().min(1),
  wordId: z.number().int().positive(),
  message: z.string().min(1).max(3000)
});

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser(request);
  if (!user) return response;

  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const target = await getAccessibleWord(user.id, body.data.bookSlug, body.data.wordId);
  if (!target) return NextResponse.json({ error: "Word not found" }, { status: 404 });

  try {
    const config = await getOrCreateModelConfig(user.id);
    const explanation = await getEffectiveExplanation(user.id, target.book.id, target.word);
    const session = await getOrCreateAiSession(user.id, target.book.id, target.word.id, target.word.word);
    await prisma.aiChatMessage.create({
      data: { sessionId: session.id, role: "user", content: body.data.message }
    });
    const recent = await getRecentMessages(session.id, 10);
    const upstream = await createChatStream(config, [
      { role: "system", content: chatSystemPrompt(target.word.word, explanation) },
      ...recent.map((message) => ({
        role: message.role === "assistant" ? "assistant" as const : "user" as const,
        content: message.content
      }))
    ], { maxTokens: Math.max(800, config.maxTokens) });

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstream.getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const parsed = JSON.parse(payload) as {
                  choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
                };
                const delta = parsed.choices?.[0]?.delta?.content || "";
                if (!delta) continue;
                answer += delta;
                controller.enqueue(encoder.encode(delta));
              } catch {
                continue;
              }
            }
          }
          if (answer.trim()) {
            await prisma.aiChatMessage.create({
              data: { sessionId: session.id, role: "assistant", content: answer.trim() }
            });
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 请求失败" }, { status: 400 });
  }
}

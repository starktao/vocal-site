import { NextRequest, NextResponse } from "next/server";
import { callChatModel, getOrCreateModelConfig } from "@/lib/ai";
import { requireApiUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser(request);
  if (!user) return response;

  try {
    const config = await getOrCreateModelConfig(user.id);
    const reply = await callChatModel(config, [
      { role: "system", content: "You are a concise API health-check assistant." },
      { role: "user", content: "用中文回复：连接成功。" }
    ], { maxTokens: 80 });
    return NextResponse.json({ ok: true, reply });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "连接失败" }, { status: 400 });
  }
}

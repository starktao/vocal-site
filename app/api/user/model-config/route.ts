import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { encryptApiKey, getOrCreateModelConfig, publicModelConfig } from "@/lib/ai";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  provider: z.string().default("deepseek"),
  baseUrl: z.string().url(),
  model: z.string().min(1),
  apiKey: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).default(0.4),
  maxTokens: z.number().int().min(512).max(12000).default(1800)
});

export async function GET(request: NextRequest) {
  const { user, response } = await requireApiUser(request);
  if (!user) return response;
  const config = await getOrCreateModelConfig(user.id);
  return NextResponse.json({ config: publicModelConfig(config) });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser(request);
  if (!user) return response;

  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const config = await prisma.userModelConfig.upsert({
    where: { userId: user.id },
    update: {
      provider: "deepseek",
      baseUrl: body.data.baseUrl.replace(/\/+$/, ""),
      model: body.data.model,
      temperature: body.data.temperature,
      maxTokens: body.data.maxTokens,
      ...(body.data.apiKey ? { encryptedApiKey: encryptApiKey(body.data.apiKey) } : {})
    },
    create: {
      userId: user.id,
      provider: "deepseek",
      baseUrl: body.data.baseUrl.replace(/\/+$/, ""),
      model: body.data.model,
      temperature: body.data.temperature,
      maxTokens: body.data.maxTokens,
      encryptedApiKey: body.data.apiKey ? encryptApiKey(body.data.apiKey) : null
    }
  });

  return NextResponse.json({ config: publicModelConfig(config) });
}

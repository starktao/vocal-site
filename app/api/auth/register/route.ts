import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  username: z.string().min(2).max(40).regex(/^[a-zA-Z0-9_\u4e00-\u9fa5-]+$/),
  password: z.string().min(6).max(100)
});

export async function POST(request: NextRequest) {
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "用户名或密码格式不正确" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { username: body.data.username } });
  if (existing) {
    return NextResponse.json({ error: "用户名已存在" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      username: body.data.username,
      passwordHash: await hashPassword(body.data.password),
      preferences: { create: {} }
    }
  });

  const response = NextResponse.json({ ok: true, user: { id: user.id, username: user.username, role: user.role } });
  setSessionCookie(response, user.id);
  return response;
}

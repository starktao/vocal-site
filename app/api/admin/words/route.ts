import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  wordId: z.number().int().positive(),
  word: z.string().min(1),
  phonetic: z.string().optional(),
  meaningText: z.string().min(1),
  explanationJson: z.unknown()
});

export async function PATCH(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const word = await prisma.word.update({
    where: { id: body.data.wordId },
    data: {
      word: body.data.word,
      phonetic: body.data.phonetic || "",
      meaningText: body.data.meaningText,
      explanationJson: JSON.stringify(body.data.explanationJson)
    }
  });
  return NextResponse.json({ ok: true, word });
}

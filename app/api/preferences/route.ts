import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveBookSlug } from "@/lib/vocab";

const schema = z.object({
  accent: z.enum(["en-US", "en-GB"]).optional(),
  soundMode: z.enum(["auto", "manual"]).optional(),
  progressFilter: z.enum(["all", "familiar", "unfamiliar", "favorite"]).optional().transform((value) => value === "familiar" ? "all" : value),
  eyeCareLevel: z.number().int().min(0).max(3).optional(),
  selectedBookSlug: z.string().min(1).optional()
});

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser(request);
  if (!user) return response;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const data = { ...body.data };
  if (data.selectedBookSlug) {
    data.selectedBookSlug = await resolveBookSlug(data.selectedBookSlug);
  }
  const preferences = await prisma.userPreference.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data }
  });
  return NextResponse.json({
    accent: preferences.accent,
    soundMode: preferences.soundMode,
    progressFilter: preferences.progressFilter,
    eyeCareLevel: preferences.eyeCareLevel,
    selectedBookSlug: preferences.selectedBookSlug
  });
}

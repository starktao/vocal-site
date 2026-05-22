import { requireUser } from "@/lib/auth";
import { getOrCreateModelConfig, publicModelConfig } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { UserSettingsForm } from "@/components/UserSettingsForm";

const progressFilterLabels: Record<string, string> = {
  all: "All",
  familiar: "All",
  unfamiliar: "不熟",
  favorite: "收藏"
};

export default async function SettingsPage() {
  const user = await requireUser();
  const [preferences, progressCount, modelConfig] = await Promise.all([
    prisma.userPreference.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id }
    }),
    prisma.userWordProgress.count({ where: { userId: user.id } }),
    getOrCreateModelConfig(user.id)
  ]);

  return (
    <UserSettingsForm
      user={user}
      modelConfig={publicModelConfig(modelConfig)}
      stats={{
        accent: preferences.accent,
        soundMode: preferences.soundMode,
        progressFilter: progressFilterLabels[preferences.progressFilter] || preferences.progressFilter,
        progressCount
      }}
    />
  );
}

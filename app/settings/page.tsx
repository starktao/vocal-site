import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const progressFilterLabels: Record<string, string> = {
  all: "All",
  familiar: "All",
  unfamiliar: "不熟",
  favorite: "收藏"
};

export default async function SettingsPage() {
  const user = await requireUser();
  const [preferences, progressCount] = await Promise.all([
    prisma.userPreference.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id }
    }),
    prisma.userWordProgress.count({ where: { userId: user.id } })
  ]);

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <h1>用户设置</h1>
          <div className="page-summary">{user.username} · {user.role}</div>
        </div>
        <Link className="secondary-btn" href="/learn">返回学习页</Link>
      </header>
      <section className="admin-grid" style={{ gridTemplateColumns: "1fr" }}>
        <div className="admin-panel">
          <div className="editor">
            <div className="stats-row">
              <div className="stat">发音：{preferences.accent}</div>
              <div className="stat">播音：{preferences.soundMode}</div>
              <div className="stat">筛选：{progressFilterLabels[preferences.progressFilter] || preferences.progressFilter}</div>
              <div className="stat">有记录单词：{progressCount}</div>
            </div>
            <p className="page-summary">
              当前版本的偏好主要在学习页顶部直接调整，并会自动保存到数据库。
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import type { UserModelConfigDto } from "@/lib/types";

export function UserSettingsForm({
  user,
  modelConfig,
  stats
}: {
  user: { username: string; role: string };
  modelConfig: UserModelConfigDto;
  stats: { accent: string; soundMode: string; progressFilter: string; progressCount: number };
}) {
  const [baseUrl, setBaseUrl] = useState(modelConfig.baseUrl);
  const [model, setModel] = useState(modelConfig.model);
  const [apiKey, setApiKey] = useState("");
  const [temperature, setTemperature] = useState(String(modelConfig.temperature));
  const [maxTokens, setMaxTokens] = useState(String(modelConfig.maxTokens));
  const [hasApiKey, setHasApiKey] = useState(modelConfig.hasApiKey);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/user/model-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "deepseek",
        baseUrl,
        model,
        apiKey: apiKey.trim() || undefined,
        temperature: Number(temperature),
        maxTokens: Number(maxTokens)
      })
    });
    const data = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setMessage(data?.error || "保存失败");
      return;
    }
    setHasApiKey(Boolean(data.config?.hasApiKey));
    setApiKey("");
    setMessage("模型配置已保存");
  }

  async function testModel() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/user/model-config/test", { method: "POST" });
    const data = await response.json().catch(() => null);
    setBusy(false);
    setMessage(response.ok ? `连接成功：${data.reply || "模型已响应"}` : data?.error || "连接失败");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <h1>用户中心</h1>
          <div className="page-summary">{user.username} · {user.role}</div>
        </div>
        <div className="account-actions">
          <Link className="secondary-btn" href="/learn">返回学习页</Link>
          <button className="secondary-btn" type="button" onClick={logout}>退出登录</button>
        </div>
      </header>
      <section className="admin-grid" style={{ gridTemplateColumns: "1fr" }}>
        <div className="admin-panel">
          <form className="editor" onSubmit={save}>
            <div className="stats-row">
              <div className="stat">发音：{stats.accent}</div>
              <div className="stat">播音：{stats.soundMode}</div>
              <div className="stat">筛选：{stats.progressFilter}</div>
              <div className="stat">有记录单词：{stats.progressCount}</div>
            </div>
            <label className="field">
              <span>模型服务</span>
              <input value="DeepSeek" disabled />
            </label>
            <label className="field">
              <span>Base URL</span>
              <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
            </label>
            <label className="field">
              <span>模型名</span>
              <input value={model} onChange={(event) => setModel(event.target.value)} />
            </label>
            <label className="field">
              <span>API Key {hasApiKey ? "（已保存，留空则不修改）" : ""}</span>
              <input
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={hasApiKey ? "已保存 API key" : "sk-..."}
                type="password"
                autoComplete="off"
              />
            </label>
            <div className="settings-row">
              <label className="field">
                <span>Temperature</span>
                <input value={temperature} onChange={(event) => setTemperature(event.target.value)} inputMode="decimal" />
              </label>
              <label className="field">
                <span>Max Tokens</span>
                <input value={maxTokens} onChange={(event) => setMaxTokens(event.target.value)} inputMode="numeric" />
              </label>
            </div>
            <div className="auth-error">{message}</div>
            <div className="form-actions">
              <button className="primary-btn" type="submit" disabled={busy}>{busy ? "处理中..." : "保存模型配置"}</button>
              <button className="secondary-btn" type="button" onClick={testModel} disabled={busy || !hasApiKey}>测试连接</button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

type Props = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isLogin = mode === "login";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(data.error || "操作失败");
      return;
    }
    router.replace(searchParams.get("next") || "/learn");
    router.refresh();
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>{isLogin ? "登录词汇系统" : "注册新账号"}</h1>
        <p>{isLogin ? "继续你的词汇复习进度。" : "本地版本无需邮箱验证，注册后直接进入。"}</p>
        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span>用户名</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label className="field">
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isLogin ? "current-password" : "new-password"}
            />
          </label>
          <div className="auth-error">{error}</div>
          <button className="primary-btn" type="submit" disabled={loading}>
            {loading ? "处理中..." : isLogin ? "登录" : "注册并登录"}
          </button>
        </form>
        <div className="auth-foot">
          {isLogin ? (
            <>
              还没有账号？ <Link className="link-btn" href="/register">去注册</Link>
            </>
          ) : (
            <>
              已经有账号？ <Link className="link-btn" href="/login">去登录</Link>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

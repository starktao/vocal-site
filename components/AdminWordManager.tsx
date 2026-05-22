"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import type { VocabCard } from "@/lib/types";

export function AdminWordManager({
  words,
  stats
}: {
  words: VocabCard[];
  stats: { users: number; progressRows: number; wordCount: number };
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(words[0]?.id || 0);
  const selected = words.find((word) => word.id === selectedId) || words[0];
  const [wordText, setWordText] = useState(selected?.word || "");
  const [phonetic, setPhonetic] = useState(selected?.phonetic || "");
  const [meaningText, setMeaningText] = useState(selected?.meaning || "");
  const [jsonText, setJsonText] = useState(JSON.stringify(selected?.explanation || {}, null, 2));
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return words.slice(0, 500);
    return words.filter((word) => word.word.toLowerCase().includes(needle) || word.meaning.toLowerCase().includes(needle)).slice(0, 500);
  }, [query, words]);

  function choose(word: VocabCard) {
    setSelectedId(word.id);
    setWordText(word.word);
    setPhonetic(word.phonetic);
    setMeaningText(word.meaning);
    setJsonText(JSON.stringify(word.explanation, null, 2));
    setMessage("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setMessage("解释 JSON 格式不正确");
      return;
    }
    const response = await fetch("/api/admin/words", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wordId: selectedId,
        word: wordText,
        phonetic,
        meaningText,
        explanationJson: parsed
      })
    });
    if (!response.ok) {
      setMessage("保存失败");
      return;
    }
    setMessage("已保存，刷新后可看到列表更新");
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <h1>管理员后台</h1>
          <div className="page-summary">词库编辑和本地学习数据概览</div>
        </div>
        <div className="account-actions">
          <Link className="secondary-btn" href="/learn">返回学习页</Link>
        </div>
      </header>
      <section className="admin-grid">
        <aside className="admin-panel">
          <div className="admin-search">
            <label className="field">
              <span>搜索单词</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="word / meaning" />
            </label>
          </div>
          <div className="word-list">
            {filtered.map((word) => (
              <button key={word.id} className={word.id === selectedId ? "is-active" : ""} type="button" onClick={() => choose(word)}>
                <strong>{word.orderIndex}. {word.word}</strong>
                <div className="page-summary">{word.meaning}</div>
              </button>
            ))}
          </div>
        </aside>
        <section className="admin-panel">
          <form className="editor" onSubmit={save}>
            <div className="stats-row">
              <div className="stat">用户 {stats.users}</div>
              <div className="stat">词汇 {stats.wordCount}</div>
              <div className="stat">学习记录 {stats.progressRows}</div>
            </div>
            <label className="field">
              <span>单词</span>
              <input value={wordText} onChange={(event) => setWordText(event.target.value)} />
            </label>
            <label className="field">
              <span>音标</span>
              <input value={phonetic} onChange={(event) => setPhonetic(event.target.value)} />
            </label>
            <label className="field">
              <span>基础释义</span>
              <input value={meaningText} onChange={(event) => setMeaningText(event.target.value)} />
            </label>
            <label className="field">
              <span>完整解释 JSON</span>
              <textarea value={jsonText} onChange={(event) => setJsonText(event.target.value)} />
            </label>
            <div className="auth-error">{message}</div>
            <button className="primary-btn" type="submit">保存修改</button>
          </form>
        </section>
      </section>
    </main>
  );
}

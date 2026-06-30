'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Project, Status, STATUSES } from '@/lib/types';
import { loadProjects, saveProjects, newId, now } from '@/lib/storage';
import { seedProjects } from '@/lib/seed';

const STATUS_COLORS: Record<Status, string> = {
  進行中: '#6d5dfc',
  保留: '#f0a020',
  完了: '#27ae60',
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [showDetail, setShowDetail] = useState(false); // スマホ用
  const [loaded, setLoaded] = useState(false);
  const [savedLabel, setSavedLabel] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // 初回ロード（無ければ seed）
  useEffect(() => {
    const existing = loadProjects();
    const data = existing && existing.length ? existing : seedProjects();
    setProjects(data);
    setSelectedId(data[0]?.id ?? null);
    setLoaded(true);
  }, []);

  // 自動保存
  useEffect(() => {
    if (!loaded) return;
    saveProjects(projects);
    setSavedLabel(`保存済み ${formatDate(Date.now())}`);
  }, [projects, loaded]);

  const sorted = useMemo(
    () => [...projects].sort((a, b) => b.updatedAt - a.updatedAt),
    [projects]
  );
  const selected = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? null,
    [projects, selectedId]
  );

  function updateSelected(patch: Partial<Project>) {
    if (!selected) return;
    setProjects((prev) =>
      prev.map((p) =>
        p.id === selected.id ? { ...p, ...patch, updatedAt: now() } : p
      )
    );
  }

  function openProject(id: string) {
    setSelectedId(id);
    setShowDetail(true);
    setView('edit');
  }

  function createProject() {
    const t = now();
    const p: Project = {
      id: newId(),
      title: '新しいプロジェクト',
      status: '進行中',
      body: '# 新しいプロジェクト\n\nここに進捗を書く。\n',
      createdAt: t,
      updatedAt: t,
    };
    setProjects((prev) => [p, ...prev]);
    openProject(p.id);
  }

  function deleteProject(id: string) {
    if (!confirm('このプロジェクトを削除する？元に戻せないよ。')) return;
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return next;
    });
    setShowDetail(false);
  }

  function exportSelected() {
    if (!selected) return;
    const safe = selected.title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'project';
    const blob = new Blob([selected.body], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safe}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const title = file.name.replace(/\.md$/i, '') || 'インポート';
      const t = now();
      const p: Project = {
        id: newId(),
        title,
        status: '進行中',
        body: text,
        createdAt: t,
        updatedAt: t,
      };
      setProjects((prev) => [p, ...prev]);
      openProject(p.id);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div className={`app${showDetail ? ' show-detail' : ''}`}>
      {/* 左：一覧 */}
      <aside className="sidebar">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="Kiroku" />
          <h1>
            Kiroku<span>記録</span>
          </h1>
        </div>
        <button className="new-btn" onClick={createProject}>
          ＋ 新規プロジェクト
        </button>
        <ul className="list">
          {sorted.map((p) => (
            <li
              key={p.id}
              className={`card${p.id === selectedId ? ' active' : ''}`}
              onClick={() => openProject(p.id)}
            >
              <p className="card-title">{p.title || '(無題)'}</p>
              <div className="card-meta">
                <span
                  className="chip"
                  style={{ background: STATUS_COLORS[p.status] }}
                >
                  {p.status}
                </span>
                <span className="card-date">{formatDate(p.updatedAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      {/* 右：エディタ */}
      <main className="main">
        {selected ? (
          <>
            <div className="toolbar">
              <button
                className="back-btn"
                onClick={() => setShowDetail(false)}
                aria-label="一覧へ戻る"
              >
                ← 一覧
              </button>
              <input
                className="title-input"
                value={selected.title}
                onChange={(e) => updateSelected({ title: e.target.value })}
                placeholder="タイトル"
              />
              <select
                className="status-select"
                value={selected.status}
                onChange={(e) =>
                  updateSelected({ status: e.target.value as Status })
                }
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button className="icon-btn" onClick={exportSelected}>
                .mdで保存
              </button>
              <button className="icon-btn" onClick={() => fileRef.current?.click()}>
                .mdを開く
              </button>
              <button
                className="icon-btn danger"
                onClick={() => deleteProject(selected.id)}
              >
                削除
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".md,text/markdown,text/plain"
                style={{ display: 'none' }}
                onChange={importFile}
              />
            </div>

            <div className="tabs">
              <button
                className={`tab${view === 'edit' ? ' active' : ''}`}
                onClick={() => setView('edit')}
              >
                編集
              </button>
              <button
                className={`tab${view === 'preview' ? ' active' : ''}`}
                onClick={() => setView('preview')}
              >
                プレビュー
              </button>
            </div>

            <div className="content">
              {view === 'edit' ? (
                <textarea
                  className="editor"
                  value={selected.body}
                  onChange={(e) => updateSelected({ body: e.target.value })}
                  placeholder="Markdown で進捗を書く..."
                  spellCheck={false}
                />
              ) : (
                <div className="md">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selected.body}
                  </ReactMarkdown>
                </div>
              )}
            </div>
            <div className="saved">{savedLabel}</div>
          </>
        ) : (
          <div className="empty">
            左から選ぶか「＋ 新規プロジェクト」で始めよう
          </div>
        )}
      </main>
    </div>
  );
}

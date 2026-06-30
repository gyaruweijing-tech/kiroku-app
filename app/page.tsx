'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MdFile, Project, Status, STATUSES } from '@/lib/types';
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
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
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
    setSelectedFileId(data[0]?.files[0]?.id ?? null);
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
  const selectedFile = useMemo(
    () => selected?.files.find((f) => f.id === selectedFileId) ?? null,
    [selected, selectedFileId]
  );

  // プロジェクト自体（タイトル・ステータス）を更新
  function updateProject(patch: Partial<Pick<Project, 'title' | 'status'>>) {
    if (!selected) return;
    setProjects((prev) =>
      prev.map((p) =>
        p.id === selected.id ? { ...p, ...patch, updatedAt: now() } : p
      )
    );
  }

  // 選択中ファイル（名前・本文）を更新。ファイルとプロジェクト両方の更新日時を進める
  function updateFile(patch: Partial<Pick<MdFile, 'name' | 'body'>>) {
    if (!selected || !selectedFile) return;
    const t = now();
    setProjects((prev) =>
      prev.map((p) =>
        p.id !== selected.id
          ? p
          : {
              ...p,
              updatedAt: t,
              files: p.files.map((f) =>
                f.id === selectedFile.id ? { ...f, ...patch, updatedAt: t } : f
              ),
            }
      )
    );
  }

  function openProject(id: string) {
    const proj = projects.find((p) => p.id === id);
    setSelectedId(id);
    setSelectedFileId(proj?.files[0]?.id ?? null);
    setShowDetail(true);
    setView('edit');
  }

  function createProject() {
    const t = now();
    const file: MdFile = {
      id: newId(),
      name: 'メモ',
      body: '# メモ\n\nここに書く。\n',
      createdAt: t,
      updatedAt: t,
    };
    const p: Project = {
      id: newId(),
      title: '新しいプロジェクト',
      status: '進行中',
      files: [file],
      createdAt: t,
      updatedAt: t,
    };
    setProjects((prev) => [p, ...prev]);
    setSelectedId(p.id);
    setSelectedFileId(file.id);
    setShowDetail(true);
    setView('edit');
  }

  function deleteProject(id: string) {
    if (!confirm('このプロジェクトを丸ごと削除する？中のファイルも全部消えるよ。')) return;
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (selectedId === id) {
        setSelectedId(next[0]?.id ?? null);
        setSelectedFileId(next[0]?.files[0]?.id ?? null);
      }
      return next;
    });
    setShowDetail(false);
  }

  // 選択中プロジェクトにファイルを1つ追加
  function createFile() {
    if (!selected) return;
    const t = now();
    const n = selected.files.length + 1;
    const file: MdFile = {
      id: newId(),
      name: `新しいファイル${n}`,
      body: '',
      createdAt: t,
      updatedAt: t,
    };
    setProjects((prev) =>
      prev.map((p) =>
        p.id === selected.id
          ? { ...p, updatedAt: t, files: [...p.files, file] }
          : p
      )
    );
    setSelectedFileId(file.id);
    setView('edit');
  }

  function deleteFile(fileId: string) {
    if (!selected) return;
    if (selected.files.length <= 1) {
      alert('最後の1ファイルは消せないよ。プロジェクトごと削除してね。');
      return;
    }
    if (!confirm('このファイルを削除する？元に戻せないよ。')) return;
    const t = now();
    setProjects((prev) =>
      prev.map((p) =>
        p.id === selected.id
          ? { ...p, updatedAt: t, files: p.files.filter((f) => f.id !== fileId) }
          : p
      )
    );
    if (selectedFileId === fileId) {
      const rest = selected.files.filter((f) => f.id !== fileId);
      setSelectedFileId(rest[0]?.id ?? null);
    }
  }

  // 選択中ファイルを .md として書き出し
  function exportFile() {
    if (!selectedFile) return;
    const safe =
      selectedFile.name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'file';
    const blob = new Blob([selectedFile.body], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safe}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // .md を読み込んで「選択中プロジェクトの新しいファイル」として追加
  function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const name = file.name.replace(/\.md$/i, '') || 'インポート';
      const t = now();
      const md: MdFile = {
        id: newId(),
        name,
        body: text,
        createdAt: t,
        updatedAt: t,
      };
      setProjects((prev) =>
        prev.map((p) =>
          p.id === selected.id
            ? { ...p, updatedAt: t, files: [...p.files, md] }
            : p
        )
      );
      setSelectedFileId(md.id);
      setView('edit');
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div className={`app${showDetail ? ' show-detail' : ''}`}>
      {/* 左：プロジェクト一覧 */}
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
                <span className="card-date">
                  {p.files.length}ファイル ・ {formatDate(p.updatedAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      {/* 右：プロジェクト詳細（ファイル群） */}
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
                onChange={(e) => updateProject({ title: e.target.value })}
                placeholder="プロジェクト名"
              />
              <select
                className="status-select"
                value={selected.status}
                onChange={(e) =>
                  updateProject({ status: e.target.value as Status })
                }
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                className="icon-btn danger"
                onClick={() => deleteProject(selected.id)}
              >
                プロジェクト削除
              </button>
            </div>

            {/* ファイルタブ（横スクロール） */}
            <div className="filebar">
              {selected.files.map((f) => (
                <button
                  key={f.id}
                  className={`filetab${f.id === selectedFileId ? ' active' : ''}`}
                  onClick={() => {
                    setSelectedFileId(f.id);
                    setView('edit');
                  }}
                  title={f.name}
                >
                  📄 {f.name || '(無題)'}
                </button>
              ))}
              <button className="filetab add" onClick={createFile}>
                ＋ ファイル
              </button>
              <button
                className="filetab add"
                onClick={() => fileRef.current?.click()}
              >
                .mdを開く
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".md,text/markdown,text/plain"
                style={{ display: 'none' }}
                onChange={importFile}
              />
            </div>

            {selectedFile ? (
              <>
                {/* ファイル名 ＋ 編集/プレビュー ＋ 書き出し/削除 */}
                <div className="fileactions">
                  <input
                    className="filename-input"
                    value={selectedFile.name}
                    onChange={(e) => updateFile({ name: e.target.value })}
                    placeholder="ファイル名"
                  />
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
                  <button className="icon-btn" onClick={exportFile}>
                    .mdで保存
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={() => deleteFile(selectedFile.id)}
                  >
                    ファイル削除
                  </button>
                </div>

                <div className="content">
                  {view === 'edit' ? (
                    <textarea
                      className="editor"
                      value={selectedFile.body}
                      onChange={(e) => updateFile({ body: e.target.value })}
                      placeholder="Markdown で書く..."
                      spellCheck={false}
                    />
                  ) : (
                    <div className="md">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {selectedFile.body}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
                <div className="saved">{savedLabel}</div>
              </>
            ) : (
              <div className="empty">「＋ ファイル」でファイルを追加しよう</div>
            )}
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

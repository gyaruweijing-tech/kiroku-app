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
  const [showTrash, setShowTrash] = useState(false); // ゴミ箱画面
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'title'>(
    'updated'
  );
  const [loaded, setLoaded] = useState(false);
  const [savedLabel, setSavedLabel] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // 初回ロード（無ければ seed）
  useEffect(() => {
    const existing = loadProjects();
    const data = existing && existing.length ? existing : seedProjects();
    setProjects(data);
    const firstProj = data.find((p) => !p.deletedAt) ?? null;
    setSelectedId(firstProj?.id ?? null);
    setSelectedFileId(
      firstProj?.files.find((f) => !f.deletedAt)?.id ?? null
    );
    setLoaded(true);
  }, []);

  // 自動保存
  useEffect(() => {
    if (!loaded) return;
    saveProjects(projects);
    setSavedLabel(`保存済み ${formatDate(Date.now())}`);
  }, [projects, loaded]);

  // 通常表示（ゴミ箱以外）。絞り込み→並び替え。注力中は常に最上部
  const sorted = useMemo(() => {
    const cmp = (a: Project, b: Project) => {
      if (sortBy === 'created') return b.createdAt - a.createdAt;
      if (sortBy === 'title') return a.title.localeCompare(b.title, 'ja');
      return b.updatedAt - a.updatedAt;
    };
    return [...projects]
      .filter((p) => !p.deletedAt)
      .filter((p) => statusFilter === 'all' || p.status === statusFilter)
      .sort(
        (a, b) => (b.focused ? 1 : 0) - (a.focused ? 1 : 0) || cmp(a, b)
      );
  }, [projects, statusFilter, sortBy]);
  const selected = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? null,
    [projects, selectedId]
  );
  // 選択中プロジェクトの「生きている」ファイル
  const activeFiles = useMemo(
    () => selected?.files.filter((f) => !f.deletedAt) ?? [],
    [selected]
  );
  const selectedFile = useMemo(
    () => activeFiles.find((f) => f.id === selectedFileId) ?? null,
    [activeFiles, selectedFileId]
  );

  // ゴミ箱の中身
  const trashedProjects = useMemo(
    () =>
      projects
        .filter((p) => p.deletedAt)
        .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
    [projects]
  );
  // 生きているプロジェクトの中で、削除されたファイル
  const trashedFiles = useMemo(() => {
    const out: { project: Project; file: MdFile }[] = [];
    for (const p of projects) {
      if (p.deletedAt) continue; // プロジェクトごと削除はプロジェクト側で扱う
      for (const f of p.files) {
        if (f.deletedAt) out.push({ project: p, file: f });
      }
    }
    return out.sort(
      (a, b) => (b.file.deletedAt ?? 0) - (a.file.deletedAt ?? 0)
    );
  }, [projects]);
  const trashCount = trashedProjects.length + trashedFiles.length;

  // プロジェクト自体（タイトル・ステータス・次の一手）を更新
  function updateProject(
    patch: Partial<Pick<Project, 'title' | 'status' | 'nextAction'>>
  ) {
    if (!selected) return;
    setProjects((prev) =>
      prev.map((p) =>
        p.id === selected.id ? { ...p, ...patch, updatedAt: now() } : p
      )
    );
  }

  // 「いま注力」を切り替え。常に1つだけ true（再度押すと解除）
  function toggleFocus(id: string) {
    setProjects((prev) => {
      const target = prev.find((p) => p.id === id);
      const turnOn = !target?.focused;
      return prev.map((p) =>
        p.id === id
          ? { ...p, focused: turnOn }
          : p.focused
          ? { ...p, focused: false }
          : p
      );
    });
  }

  // 選択中ファイル（名前・本文）を更新
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
    setSelectedFileId(proj?.files.find((f) => !f.deletedAt)?.id ?? null);
    setShowDetail(true);
    setShowTrash(false);
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
    setShowTrash(false);
    setView('edit');
  }

  // === ゴミ箱：ソフト削除 ===
  function trashProject(id: string) {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, deletedAt: now() } : p))
    );
    if (selectedId === id) {
      const next = projects.find((p) => p.id !== id && !p.deletedAt) ?? null;
      setSelectedId(next?.id ?? null);
      setSelectedFileId(next?.files.find((f) => !f.deletedAt)?.id ?? null);
    }
    setShowDetail(false);
  }

  function trashFile(fileId: string) {
    if (!selected) return;
    const t = now();
    setProjects((prev) =>
      prev.map((p) =>
        p.id === selected.id
          ? {
              ...p,
              updatedAt: t,
              files: p.files.map((f) =>
                f.id === fileId ? { ...f, deletedAt: t } : f
              ),
            }
          : p
      )
    );
    if (selectedFileId === fileId) {
      const rest = activeFiles.filter((f) => f.id !== fileId);
      setSelectedFileId(rest[0]?.id ?? null);
    }
  }

  // === ゴミ箱：復元 ===
  function restoreProject(id: string) {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const { deletedAt, ...rest } = p;
        return { ...rest, updatedAt: now() };
      })
    );
  }

  function restoreFile(projectId: string, fileId: string) {
    setProjects((prev) =>
      prev.map((p) =>
        p.id !== projectId
          ? p
          : {
              ...p,
              updatedAt: now(),
              files: p.files.map((f) => {
                if (f.id !== fileId) return f;
                const { deletedAt, ...rest } = f;
                return rest;
              }),
            }
      )
    );
  }

  // === ゴミ箱：完全削除（戻せない） ===
  function purgeProject(id: string) {
    if (!confirm('完全に削除する？これはもう元に戻せないよ。')) return;
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  function purgeFile(projectId: string, fileId: string) {
    if (!confirm('このファイルを完全に削除する？もう元に戻せないよ。')) return;
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? { ...p, files: p.files.filter((f) => f.id !== fileId) }
          : p
      )
    );
  }

  // 選択中プロジェクトにファイルを1つ追加
  function createFile() {
    if (!selected) return;
    const t = now();
    const n = activeFiles.length + 1;
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
        <div className="filters">
          <div className="filter-chips">
            {(['all', ...STATUSES] as const).map((s) => (
              <button
                key={s}
                className={`filter-chip${statusFilter === s ? ' active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? 'すべて' : s}
              </button>
            ))}
          </div>
          <select
            className="sort-select"
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as 'updated' | 'created' | 'title')
            }
          >
            <option value="updated">更新が新しい順</option>
            <option value="created">作成が新しい順</option>
            <option value="title">名前順</option>
          </select>
        </div>
        <ul className="list">
          {sorted.map((p) => {
            const fileCount = p.files.filter((f) => !f.deletedAt).length;
            return (
              <li
                key={p.id}
                className={`card${
                  p.id === selectedId && !showTrash ? ' active' : ''
                }${p.focused ? ' focused' : ''}`}
                onClick={() => openProject(p.id)}
              >
                {p.focused && <span className="focus-badge">⭐ いま注力</span>}
                <p className="card-title">{p.title || '(無題)'}</p>
                {p.nextAction?.trim() && (
                  <p className="card-next">→ {p.nextAction}</p>
                )}
                <div className="card-meta">
                  <span
                    className="chip"
                    style={{ background: STATUS_COLORS[p.status] }}
                  >
                    {p.status}
                  </span>
                  <span className="card-date">
                    {fileCount}ファイル ・ {formatDate(p.updatedAt)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        <button
          className={`trash-btn${showTrash ? ' active' : ''}`}
          onClick={() => {
            setShowTrash(true);
            setShowDetail(true);
          }}
        >
          🗑 ゴミ箱{trashCount > 0 ? `（${trashCount}）` : ''}
        </button>
      </aside>

      {/* 右：ゴミ箱 or プロジェクト詳細 */}
      <main className="main">
        {showTrash ? (
          <TrashPanel
            trashedProjects={trashedProjects}
            trashedFiles={trashedFiles}
            onBack={() => setShowDetail(false)}
            onClose={() => setShowTrash(false)}
            onRestoreProject={restoreProject}
            onPurgeProject={purgeProject}
            onRestoreFile={restoreFile}
            onPurgeFile={purgeFile}
          />
        ) : selected ? (
          <>
            <div className="toolbar">
              <button
                className="back-btn"
                onClick={() => setShowDetail(false)}
                aria-label="一覧へ戻る"
              >
                ← 一覧
              </button>
              <button
                className={`focus-btn${selected.focused ? ' on' : ''}`}
                onClick={() => toggleFocus(selected.id)}
                title={
                  selected.focused
                    ? '注力中（クリックで解除）'
                    : 'このプロジェクトを「いま注力」にする'
                }
              >
                {selected.focused ? '⭐ 注力中' : '☆ 注力にする'}
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
                onClick={() => trashProject(selected.id)}
                title="プロジェクトをゴミ箱へ"
              >
                プロジェクト削除
              </button>
            </div>

            {/* 次の一手 */}
            <div className="nextbar">
              <span className="nextbar-label">🎯 次の一手</span>
              <input
                className="nextbar-input"
                value={selected.nextAction ?? ''}
                onChange={(e) => updateProject({ nextAction: e.target.value })}
                placeholder="次にやること1つを書く（例：API設計を決める）"
              />
            </div>

            {/* ファイルタブ（横スクロール） */}
            <div className="filebar">
              {activeFiles.map((f) => (
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
                    onClick={() => trashFile(selectedFile.id)}
                    title="ファイルをゴミ箱へ"
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

// ===== ゴミ箱パネル =====
function TrashPanel({
  trashedProjects,
  trashedFiles,
  onBack,
  onClose,
  onRestoreProject,
  onPurgeProject,
  onRestoreFile,
  onPurgeFile,
}: {
  trashedProjects: Project[];
  trashedFiles: { project: Project; file: MdFile }[];
  onBack: () => void;
  onClose: () => void;
  onRestoreProject: (id: string) => void;
  onPurgeProject: (id: string) => void;
  onRestoreFile: (projectId: string, fileId: string) => void;
  onPurgeFile: (projectId: string, fileId: string) => void;
}) {
  const empty = trashedProjects.length === 0 && trashedFiles.length === 0;
  return (
    <>
      <div className="toolbar">
        <button className="back-btn" onClick={onBack} aria-label="一覧へ戻る">
          ← 一覧
        </button>
        <h2 className="trash-title">🗑 ゴミ箱</h2>
        <button className="icon-btn" onClick={onClose}>
          閉じる
        </button>
      </div>
      <div className="content">
        {empty ? (
          <div className="empty">ゴミ箱は空っぽ。</div>
        ) : (
          <>
            <p className="trash-note">
              「復元」で元の場所に戻ります。「完全削除」は元に戻せません。
            </p>

            {trashedProjects.length > 0 && (
              <section className="trash-section">
                <h3>プロジェクト</h3>
                {trashedProjects.map((p) => (
                  <div key={p.id} className="trash-row">
                    <div className="trash-info">
                      <span className="trash-name">📁 {p.title || '(無題)'}</span>
                      <span className="trash-sub">
                        {p.files.length}ファイル ・ 削除{' '}
                        {p.deletedAt ? formatDate(p.deletedAt) : ''}
                      </span>
                    </div>
                    <div className="trash-actions">
                      <button
                        className="icon-btn"
                        onClick={() => onRestoreProject(p.id)}
                      >
                        復元
                      </button>
                      <button
                        className="icon-btn danger"
                        onClick={() => onPurgeProject(p.id)}
                      >
                        完全削除
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {trashedFiles.length > 0 && (
              <section className="trash-section">
                <h3>ファイル</h3>
                {trashedFiles.map(({ project, file }) => (
                  <div key={file.id} className="trash-row">
                    <div className="trash-info">
                      <span className="trash-name">📄 {file.name || '(無題)'}</span>
                      <span className="trash-sub">
                        {project.title} ・ 削除{' '}
                        {file.deletedAt ? formatDate(file.deletedAt) : ''}
                      </span>
                    </div>
                    <div className="trash-actions">
                      <button
                        className="icon-btn"
                        onClick={() => onRestoreFile(project.id, file.id)}
                      >
                        復元
                      </button>
                      <button
                        className="icon-btn danger"
                        onClick={() => onPurgeFile(project.id, file.id)}
                      >
                        完全削除
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

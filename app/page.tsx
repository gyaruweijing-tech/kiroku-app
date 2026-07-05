'use client';

import {
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LogEntry, MdFile, Project, Status, STATUSES } from '@/lib/types';
import {
  loadProjects,
  saveProjects,
  pullRemote,
  pushRemote,
  mergeProjects,
  newId,
  now,
} from '@/lib/storage';
import { seedProjects } from '@/lib/seed';
import { Stats, fetchStats } from '@/lib/stats';
import {
  XpRoll,
  WEEK_GOAL_DAYS,
  calcWeekStreak,
  dayKey,
  daysThisWeek,
  levelInfo,
  rollXp,
  totalXp,
  weekMultiplier,
} from '@/lib/xp';
import {
  IconArrowLeft,
  IconCheck,
  IconChevronDown,
  IconCloud,
  IconClose,
  IconDots,
  IconDownload,
  IconEdit,
  IconEye,
  IconFile,
  IconFilePlus,
  IconFlag,
  IconFlame,
  IconFolder,
  IconPlus,
  IconRestore,
  IconSprout,
  IconStar,
  IconTarget,
  IconTrash,
  IconZap,
} from './icons';

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

// 「◯分前 / ◯時間前 / ◯日前」のゆるい相対表示（push履歴用）
function agoLabel(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'たった今';
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

// ===== あゆみ（スタンプ）の計算 =====
// 日付キー dayKey や XP計算は lib/xp.ts に集約（node単体でテストできる純関数群）

// 連続日数：今日（まだ押してなければ昨日）から、途切れるまで遡って数える
function calcStreak(log: LogEntry[] | undefined): number {
  if (!log?.length) return 0;
  const days = new Set(log.map((e) => dayKey(e.at)));
  const d = new Date();
  if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d.getTime()))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

// ===== 「…」ドロップダウンメニュー（外側クリック/Escで閉じる） =====
function Menu({
  trigger,
  children,
  label = 'メニュー',
}: {
  trigger: ReactNode;
  children: ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button
        className="menu-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        {trigger}
      </button>
      {open && (
        <div className="menu-pop" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

// 中身に合わせて縦に伸びるテキスト欄（1行入力だと長文が切れて見えないので）
function AutoTextarea({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={1}
    />
  );
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [view, setView] = useState<'edit' | 'preview'>('preview'); // 読む→書くの順。既定はプレビュー
  const [fileListOpen, setFileListOpen] = useState(false); // ファイルの折りたたみ縦リスト
  const [ayumiOpen, setAyumiOpen] = useState(false); // あゆみ（スタンプ）の開閉
  const [logInput, setLogInput] = useState(''); // スタンプの入力欄
  // XP演出：スタンプ直後の「+112!」ポップと、Lvアップ時の狙い/原点の再表示
  const [xpPop, setXpPop] = useState<(XpRoll & { key: number }) | null>(null);
  const [levelUp, setLevelUp] = useState<{
    to: number;
    title: string;
    goal?: string;
    origin?: string;
  } | null>(null);
  const [showDetail, setShowDetail] = useState(false); // スマホ用
  const [showTrash, setShowTrash] = useState(false); // ゴミ箱画面
  // 開発の軌跡（push数・生存コード）。GitHub Actionが生成したものを読むだけの飾り
  const [stats, setStats] = useState<Stats | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [statsFocusId, setStatsFocusId] = useState<string | null>(null); // 開いた時に出すプロジェクト個別詳細
  // 原点は普段は折りたたむ（狙いは常時表示。ごちゃつき防止）
  const [originOpen, setOriginOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'title'>(
    'updated'
  );
  const [loaded, setLoaded] = useState(false);
  const [savedLabel, setSavedLabel] = useState('');
  const [syncMsg, setSyncMsg] = useState('');
  const [syncing, setSyncing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextPush = useRef(false);

  // 初回ロード：localStorageとGitHub(リモート)を「消さない方向」でマージする。
  // 同じidは新しい方、片方にしか無いものは必ず残す（＝端末のデータが消えない）。
  useEffect(() => {
    let cancelled = false;
    // 開発の軌跡は本体のロードを待たせず並行で取る（失敗しても無視＝ただの飾り）
    fetchStats().then((s) => {
      if (!cancelled && s) setStats(s);
    });
    (async () => {
      const local = loadProjects();
      const remote = await pullRemote();
      const data =
        local?.length || remote?.length
          ? mergeProjects(local, remote)
          : seedProjects();
      if (cancelled) return;
      // リモートとマージ結果が同じなら再pushしない。違う（＝ローカルにしか無い
      // 記録がある等）なら一度pushして端末間を揃える。
      const needPush =
        remote !== null && JSON.stringify(data) !== JSON.stringify(remote);
      skipNextPush.current = !needPush;
      setProjects(data);
      const firstProj = data.find((p) => !p.deletedAt) ?? null;
      setSelectedId(firstProj?.id ?? null);
      setSelectedFileId(
        firstProj?.files.find((f) => !f.deletedAt)?.id ?? null
      );
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 自動保存：localStorageには即保存、GitHubへは編集が3秒落ち着いてから同期
  useEffect(() => {
    if (!loaded) return;
    saveProjects(projects);
    setSavedLabel(`保存済み ${formatDate(Date.now())}`);

    if (skipNextPush.current) {
      skipNextPush.current = false;
      return;
    }
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      pushRemote(projects).then((err) => {
        setSyncMsg(
          err ? err : `GitHubに同期済み ${formatDate(Date.now())}`
        );
      });
    }, 3000);
  }, [projects, loaded]);

  // 手動同期：リモートを取得→マージ→pushして、結果（失敗理由も）を表示する
  async function syncNow() {
    if (syncing) return;
    setSyncing(true);
    setSyncMsg('同期中…');
    try {
      const remote = await pullRemote();
      const merged = mergeProjects(projects, remote);
      const err = await pushRemote(merged);
      if (JSON.stringify(merged) !== JSON.stringify(projects)) {
        skipNextPush.current = true; // 直後の自動保存で二重pushしない
        setProjects(merged);
      }
      setSyncMsg(err ? err : `GitHubに同期済み ${formatDate(Date.now())}`);
    } finally {
      setSyncing(false);
    }
  }

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

  // あゆみ：新しい順のログ＋「進んでる感」の数字（連続・開始からの日数・着手日数）
  const ayumi = useMemo(() => {
    if (!selected) return null;
    const log = [...(selected.log ?? [])].sort((a, b) => b.at - a.at);
    const daysWorked = new Set(log.map((e) => dayKey(e.at))).size;
    const sinceStart =
      Math.floor((Date.now() - selected.createdAt) / 86400000) + 1;
    const total = totalXp(selected.log);
    return {
      log,
      daysWorked,
      sinceStart,
      streak: calcStreak(selected.log),
      total,
      lv: levelInfo(total),
      weekDays: daysThisWeek(selected.log),
      weekStreak: calcWeekStreak(selected.log),
    };
  }, [selected]);

  // 選択中プロジェクトのpush数（記録が動いた回数。溜まる一方の数字）
  const projPushes = useMemo(() => {
    if (!selected || !stats) return 0;
    return stats.projects.find((x) => x.id === selected.id)?.pushes ?? 0;
  }, [selected, stats]);

  // XPポップは少し見せて自動で消す
  useEffect(() => {
    if (!xpPop) return;
    const t = setTimeout(() => setXpPop(null), 2000);
    return () => clearTimeout(t);
  }, [xpPop]);

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

  // プロジェクト自体（タイトル・ステータス・次の一手・目標）を更新
  function updateProject(
    patch: Partial<
      Pick<Project, 'title' | 'status' | 'nextAction' | 'goal' | 'origin'>
    >
  ) {
    if (!selected) return;
    setProjects((prev) =>
      prev.map((p) =>
        p.id === selected.id ? { ...p, ...patch, updatedAt: now() } : p
      )
    );
  }

  // ステータスをタップで循環（進行中→保留→完了→進行中）。selectを廃止
  function cycleStatus() {
    if (!selected) return;
    const i = STATUSES.indexOf(selected.status);
    updateProject({ status: STATUSES[(i + 1) % STATUSES.length] });
  }

  // あゆみにスタンプを1つ押す（やったこと1行を積む）＋XPガチャを回す
  function stampLog() {
    const note = logInput.trim();
    if (!note || !selected) return;
    const t = now();
    const roll = rollXp(selected.log); // 押した瞬間に確定（以後変わらない）
    const entry: LogEntry = { id: newId(), at: t, note, xp: roll.xp };
    const before = levelInfo(totalXp(selected.log)).level;
    const after = levelInfo(totalXp([...(selected.log ?? []), entry])).level;
    setProjects((prev) =>
      prev.map((p) =>
        p.id === selected.id
          ? { ...p, updatedAt: t, log: [...(p.log ?? []), entry] }
          : p
      )
    );
    setLogInput('');
    setXpPop({ ...roll, key: t });
    if (after > before) {
      // XPポップを見せてから、狙い(北極星)と原点を再注入する演出
      const { title, goal, origin } = selected;
      setTimeout(
        () => setLevelUp({ to: after, title, goal, origin }),
        1500
      );
    }
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
    setFileListOpen(false);
    setOriginOpen(false); // 原点は折りたたみ状態から
    setView('preview'); // 開いたらまず読める
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
    setFileListOpen(false);
    setView('edit'); // 新規は書き始めたいので編集から
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
    setFileListOpen(false);
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
      setFileListOpen(false);
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
          <IconPlus size={16} /> 新規プロジェクト
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
            const streak = calcStreak(p.log);
            const level = levelInfo(totalXp(p.log)).level;
            return (
              <li
                key={p.id}
                className={`card${
                  p.id === selectedId && !showTrash ? ' active' : ''
                }${p.focused ? ' focused' : ''}`}
                onClick={() => openProject(p.id)}
              >
                <p className="card-title">
                  {p.focused && (
                    <span className="focus-star" title="いま注力">
                      <IconStar size={15} filled />
                    </span>
                  )}
                  {p.title || '(無題)'}
                </p>
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
                  {level >= 2 && (
                    <span className="card-level">Lv{level}</span>
                  )}
                  {streak >= 2 && (
                    <span className="card-streak">
                      <IconFlame size={12} /> {streak}
                    </span>
                  )}
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
          <IconTrash size={16} /> ゴミ箱{trashCount > 0 ? `（${trashCount}）` : ''}
        </button>
        <div className="sync-area">
          <button className="sync-btn" onClick={syncNow} disabled={syncing}>
            <IconCloud size={16} /> {syncing ? '同期中…' : '今すぐ同期'}
          </button>
          {syncMsg && <p className="sync-msg">{syncMsg}</p>}
          {/* 開発の軌跡への入口はこの1行だけ（ごちゃつき防止） */}
          {stats && (
            <button
              className="stats-line"
              onClick={() => {
                setStatsFocusId(null); // ここからは全体ビュー
                setShowStats(true);
              }}
              title="開発の軌跡を見る"
            >
              <IconZap size={13} filled />
              <strong>{stats.pushes.total}</strong> push
              {stats.code.mature?.rate != null && (
                <span className="stats-line-rate">
                  生存率{Math.round(stats.code.mature.rate * 100)}%
                </span>
              )}
            </button>
          )}
        </div>
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
                <IconArrowLeft size={18} />
              </button>
              <button
                className={`focus-btn${selected.focused ? ' on' : ''}`}
                onClick={() => toggleFocus(selected.id)}
                aria-pressed={selected.focused ?? false}
                title={
                  selected.focused
                    ? '注力中（クリックで解除）'
                    : 'このプロジェクトを「いま注力」にする'
                }
              >
                <IconStar size={20} filled={selected.focused} />
              </button>
              <input
                className="title-input"
                value={selected.title}
                onChange={(e) => updateProject({ title: e.target.value })}
                placeholder="プロジェクト名"
              />
              <button
                className="status-chip"
                style={{ background: STATUS_COLORS[selected.status] }}
                onClick={cycleStatus}
                title="タップでステータスを切り替え"
              >
                {selected.status}
              </button>
              <Menu trigger={<IconDots size={18} />} label="プロジェクトの操作">
                <button
                  className="menu-item danger"
                  onClick={() => trashProject(selected.id)}
                >
                  <IconTrash size={16} /> プロジェクトを削除
                </button>
              </Menu>
            </div>

            {/* 目標：狙い（常時表示）＋原点（普段は折りたたみ。ごちゃつき防止） */}
            <div className="goalbar">
              <label className="goal-field">
                <span className="goal-label aim">
                  <IconFlag size={14} /> 狙い
                </span>
                <AutoTextarea
                  className="goal-input"
                  value={selected.goal ?? ''}
                  onChange={(e) => updateProject({ goal: e.target.value })}
                  placeholder="目指す先（例：中島聡さんのようなメルマガを自分に届ける）"
                />
              </label>
              <button
                className="origin-fold"
                onClick={() => setOriginOpen((o) => !o)}
                aria-expanded={originOpen}
              >
                <span className="goal-label origin">
                  <IconSprout size={14} /> 原点
                </span>
                {!originOpen && (
                  <span className="origin-fold-preview">
                    {selected.origin?.trim() || 'なぜ始めた？（タップで開く）'}
                  </span>
                )}
                <span className={`fileselect-caret${originOpen ? ' open' : ''}`}>
                  <IconChevronDown size={15} />
                </span>
              </button>
              {originOpen && (
                <AutoTextarea
                  className="goal-input"
                  value={selected.origin ?? ''}
                  onChange={(e) => updateProject({ origin: e.target.value })}
                  placeholder="なぜ始めた？（折れた時に効く物語）"
                />
              )}
            </div>

            {/* 次の一手（複数行OK） */}
            <div className="nextbar">
              <span className="nextbar-label">
                <IconTarget size={15} /> 次の一手
              </span>
              <AutoTextarea
                className="nextbar-input"
                value={selected.nextAction ?? ''}
                onChange={(e) => updateProject({ nextAction: e.target.value })}
                placeholder="次にやること1つを書く（例：API設計を決める）"
              />
            </div>

            {/* あゆみ：やったことスタンプ。積み上げ＝進んでる感（Claudeも書き込む共同ログ） */}
            <div className="ayumibar">
              <button
                className="ayumi-head"
                onClick={() => setAyumiOpen((o) => !o)}
                aria-expanded={ayumiOpen}
              >
                <span className="ayumi-label">あゆみ</span>
                <span className="ayumi-stats">
                  {ayumi && (
                    <span className="ayumi-level" title={`XP ${ayumi.total}`}>
                      Lv{ayumi.lv.level}
                    </span>
                  )}
                  {ayumi && ayumi.weekStreak >= 1 && (
                    <span
                      className="ayumi-weekmult"
                      title={`週${WEEK_GOAL_DAYS}日を${ayumi.weekStreak}週連続達成中。獲得XPが増える`}
                    >
                      ×{weekMultiplier(ayumi.weekStreak).toFixed(2)}
                    </span>
                  )}
                  <span
                    title={`今週${WEEK_GOAL_DAYS}日着手すると倍率が育つ（毎日じゃなくていい）`}
                  >
                    今週{ayumi?.weekDays}/{WEEK_GOAL_DAYS}日
                  </span>
                  {ayumi && ayumi.streak >= 2 && (
                    <span className="ayumi-streak">
                      <IconFlame size={14} /> {ayumi.streak}日連続
                    </span>
                  )}
                  <span>着手{ayumi?.daysWorked}日</span>
                  {projPushes > 0 && (
                    <span
                      className="ayumi-push"
                      role="button"
                      tabIndex={0}
                      title="このプロジェクトのpush履歴を見る"
                      onClick={(e) => {
                        e.stopPropagation(); // あゆみの開閉と分離
                        setStatsFocusId(selected.id);
                        setShowStats(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          e.preventDefault();
                          setStatsFocusId(selected.id);
                          setShowStats(true);
                        }
                      }}
                    >
                      <IconZap size={12} /> {projPushes}
                    </span>
                  )}
                </span>
                <span className={`fileselect-caret${ayumiOpen ? ' open' : ''}`}>
                  <IconChevronDown size={16} />
                </span>
              </button>
              {ayumiOpen && (
                <div className="ayumi-panel">
                  {ayumi && (
                    <div className="xpbar-row">
                      <div className="xpbar">
                        <div
                          className="xpbar-fill"
                          style={{
                            width: `${Math.min(
                              (ayumi.lv.cur / ayumi.lv.need) * 100,
                              100
                            )}%`,
                          }}
                        />
                      </div>
                      <span className="xpbar-text">
                        あと{ayumi.lv.need - ayumi.lv.cur}XPでLv
                        {ayumi.lv.level + 1}
                      </span>
                    </div>
                  )}
                  <div className="ayumi-form">
                    <input
                      className="ayumi-input"
                      value={logInput}
                      onChange={(e) => setLogInput(e.target.value)}
                      onKeyDown={(e) => {
                        // 日本語変換中のEnterでは押さない
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing)
                          stampLog();
                      }}
                      placeholder="やったことを1行（例：同期を開通させた）"
                    />
                    <button
                      className="stamp-btn"
                      onClick={stampLog}
                      disabled={!logInput.trim()}
                    >
                      <IconCheck size={15} /> スタンプ
                    </button>
                  </div>
                  <div className="ayumi-list">
                    {ayumi?.log.length ? (
                      ayumi.log.map((e) => (
                        <div key={e.id} className="ayumi-item">
                          <span className="ayumi-date">{formatDate(e.at)}</span>
                          <span className="ayumi-note">{e.note}</span>
                          {typeof e.xp === 'number' && (
                            <span className="ayumi-xp">+{e.xp}</span>
                          )}
                          {e.by === 'claude' && (
                            <span className="ayumi-by">Claude</span>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="ayumi-empty">
                        まだスタンプがないよ。今日やったことを1行押してみよう
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ファイル選択：普段は選択中の1つ＋「…」だけ。▼で全ファイルを縦に開く */}
            <div className="fileselect">
              <button
                className="fileselect-head"
                onClick={() => setFileListOpen((o) => !o)}
                aria-expanded={fileListOpen}
              >
                <IconFile size={16} />
                <span className="fileselect-name">
                  {selectedFile?.name || 'ファイルを選ぶ'}
                </span>
                <span className="fileselect-count">{activeFiles.length}</span>
                <span
                  className={`fileselect-caret${fileListOpen ? ' open' : ''}`}
                >
                  <IconChevronDown size={16} />
                </span>
              </button>
              <div className="fileselect-tools">
                {selectedFile && view === 'edit' && (
                  <button
                    className="done-btn"
                    onClick={() => setView('preview')}
                    title="編集を終えてプレビューに戻る"
                  >
                    <IconEye size={16} /> 完了
                  </button>
                )}
                <Menu trigger={<IconDots size={18} />} label="ファイルの操作">
                  {selectedFile && (
                    <button
                      className="menu-item"
                      onClick={() => setView('edit')}
                    >
                      <IconEdit size={16} /> 編集する
                    </button>
                  )}
                  <button className="menu-item" onClick={createFile}>
                    <IconPlus size={16} /> ファイルを追加
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => fileRef.current?.click()}
                  >
                    <IconFilePlus size={16} /> .mdを開く
                  </button>
                  {selectedFile && (
                    <button className="menu-item" onClick={exportFile}>
                      <IconDownload size={16} /> .mdで保存
                    </button>
                  )}
                  {selectedFile && (
                    <button
                      className="menu-item danger"
                      onClick={() => trashFile(selectedFile.id)}
                    >
                      <IconTrash size={16} /> ファイルを削除
                    </button>
                  )}
                </Menu>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".md,text/markdown,text/plain"
                style={{ display: 'none' }}
                onChange={importFile}
              />
            </div>

            {fileListOpen && (
              <div className="filelist">
                {activeFiles.map((f) => (
                  <button
                    key={f.id}
                    className={`filerow${
                      f.id === selectedFileId ? ' active' : ''
                    }`}
                    onClick={() => {
                      setSelectedFileId(f.id);
                      setFileListOpen(false);
                    }}
                  >
                    <IconFile size={15} />
                    <span>{f.name || '(無題)'}</span>
                  </button>
                ))}
                <div className="filelist-actions">
                  <button className="filelist-add" onClick={createFile}>
                    <IconPlus size={15} /> ファイル
                  </button>
                  <button
                    className="filelist-add"
                    onClick={() => fileRef.current?.click()}
                  >
                    <IconFilePlus size={15} /> .mdを開く
                  </button>
                </div>
              </div>
            )}

            {selectedFile ? (
              <>
                <div className="content">
                  {view === 'edit' ? (
                    <div className="editwrap">
                      <input
                        className="filename-input"
                        value={selectedFile.name}
                        onChange={(e) => updateFile({ name: e.target.value })}
                        placeholder="ファイル名"
                      />
                      <textarea
                        className="editor"
                        value={selectedFile.body}
                        onChange={(e) => updateFile({ body: e.target.value })}
                        placeholder="Markdown で書く..."
                        spellCheck={false}
                      />
                    </div>
                  ) : (
                    <div className="md">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {selectedFile.body}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
                <div className="saved">
                  {savedLabel}
                  {syncMsg ? ` ／ ${syncMsg}` : ''}
                </div>
              </>
            ) : (
              <div className="empty">
                「…」→「ファイルを追加」でファイルを作ろう
              </div>
            )}
          </>
        ) : (
          <div className="empty">
            左から選ぶか「＋ 新規プロジェクト」で始めよう
          </div>
        )}
      </main>

      {/* XPポップ：スタンプ直後に「+112!」をドーンと出す（自動で消える） */}
      {xpPop && (
        <div key={xpPop.key} className={`xp-pop ${xpPop.tier}`} aria-hidden>
          {xpPop.tier === 'jackpot' && (
            <div className="xp-pop-jackpot">大当たり！</div>
          )}
          <div className="xp-pop-num">+{xpPop.xp}</div>
          <div className="xp-pop-sub">
            {xpPop.firstToday && <span>今日の初着手 ×2</span>}
            {xpPop.mult > 1 && (
              <span>週連続 ×{xpPop.mult.toFixed(2)}</span>
            )}
          </div>
        </div>
      )}

      {/* 開発の軌跡：push数（溜まる運動量）と生存コード率（品質の鏡） */}
      {showStats && stats && (
        <StatsOverlay
          stats={stats}
          projects={projects}
          initialProjectId={statsFocusId}
          onClose={() => setShowStats(false)}
        />
      )}

      {/* Lvアップ：ご褒美の瞬間に狙い(北極星)と原点を再注入する */}
      {levelUp && (
        <div className="levelup-overlay" onClick={() => setLevelUp(null)}>
          <div className="levelup-card" onClick={(e) => e.stopPropagation()}>
            <p className="levelup-head">LEVEL UP</p>
            <p className="levelup-num">Lv {levelUp.to}</p>
            <p className="levelup-proj">{levelUp.title}</p>
            {levelUp.goal?.trim() && (
              <p className="levelup-goal">
                <IconFlag size={15} /> {levelUp.goal}
              </p>
            )}
            {levelUp.origin?.trim() && (
              <p className="levelup-origin">
                <IconSprout size={15} /> {levelUp.origin}
              </p>
            )}
            {!levelUp.goal?.trim() && !levelUp.origin?.trim() && (
              <p className="levelup-origin">
                狙いと原点を書いておくと、Lvアップのたびにここで思い出せるよ
              </p>
            )}
            <button className="levelup-btn" onClick={() => setLevelUp(null)}>
              刻んだ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 開発の軌跡パネル =====
// push数＝溜まる一方の運動量（XPと同じ思想）。
// 生存コード率＝書いて7日生き残った行の割合。品質の「鏡」なので目標にしない。
// 行タップ（またはあゆみの⚡）でプロジェクト個別のpush履歴にドリルダウンできる。
function StatsOverlay({
  stats,
  projects,
  initialProjectId,
  onClose,
}: {
  stats: Stats;
  projects: Project[];
  initialProjectId?: string | null;
  onClose: () => void;
}) {
  const [detailId, setDetailId] = useState<string | null>(
    initialProjectId ?? null
  );
  // 生きているプロジェクトだけ表示（昔のテスト用idや削除済みは省く）
  const alive = new Map(
    projects.filter((p) => !p.deletedAt).map((p) => [p.id, p.title])
  );
  const rows = stats.projects.filter((r) => alive.has(r.id));
  const max = rows[0]?.pushes || 1;
  const mature = stats.code.mature;
  const recent = stats.code.commits.slice(0, 12);

  // ---- プロジェクト個別ビュー ----
  if (detailId) {
    const row = stats.projects.find((r) => r.id === detailId);
    const title = alive.get(detailId) || row?.title || '(無題)';
    const log = [...(row?.pushLog ?? [])].sort((a, b) => b - a); // 新しい順
    // 今週（月曜はじまり）と今日のpush数
    const day0 = new Date();
    day0.setHours(0, 0, 0, 0);
    const week0 = new Date(day0);
    week0.setDate(week0.getDate() - ((week0.getDay() + 6) % 7));
    const today = log.filter((t) => t >= day0.getTime()).length;
    const week = log.filter((t) => t >= week0.getTime()).length;
    const shown = log.slice(0, 30);
    return (
      <div className="stats-overlay" onClick={onClose}>
        <div className="stats-card" onClick={(e) => e.stopPropagation()}>
          <div className="stats-head">
            <button
              className="icon-btn"
              onClick={() => setDetailId(null)}
              aria-label="全体に戻る"
            >
              <IconArrowLeft size={16} /> 全体
            </button>
            <button className="icon-btn" onClick={onClose}>
              <IconClose size={16} /> 閉じる
            </button>
          </div>
          <h2 className="stats-detail-title">
            <IconZap size={17} filled /> {title}
          </h2>

          <div className="stats-tiles">
            <div className="stats-tile">
              <span className="stats-num">{row?.pushes ?? 0}</span>
              <span className="stats-cap">累計push</span>
            </div>
            <div className="stats-tile">
              <span className="stats-num">{week}</span>
              <span className="stats-cap">今週</span>
            </div>
            <div className="stats-tile">
              <span className="stats-num">{today}</span>
              <span className="stats-cap">今日</span>
            </div>
          </div>

          <section className="stats-section">
            <h3>
              push履歴
              <span className="stats-hint">
                このプロジェクトの記録が変わったコミットの時刻
              </span>
            </h3>
            <div className="stats-commits">
              {shown.length ? (
                shown.map((t, i) => (
                  <div key={`${t}-${i}`} className="stats-commit">
                    <span className="stats-hist-date">{formatDate(t)}</span>
                    <span className="stats-hist-ago">{agoLabel(t)}</span>
                  </div>
                ))
              ) : (
                <p className="stats-rate">まだ履歴がない（次の集計で反映）</p>
              )}
              {log.length > shown.length && (
                <p className="stats-more">ほか {log.length - shown.length} 件</p>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  // ---- 全体ビュー ----
  return (
    <div className="stats-overlay" onClick={onClose}>
      <div className="stats-card" onClick={(e) => e.stopPropagation()}>
        <div className="stats-head">
          <h2>
            <IconZap size={18} filled /> 開発の軌跡
          </h2>
          <button className="icon-btn" onClick={onClose}>
            <IconClose size={16} /> 閉じる
          </button>
        </div>

        <div className="stats-tiles">
          <div className="stats-tile">
            <span className="stats-num">{stats.pushes.total}</span>
            <span className="stats-cap">総push</span>
          </div>
          <div className="stats-tile">
            <span className="stats-num">{stats.pushes.record}</span>
            <span className="stats-cap">記録push</span>
          </div>
          <div className="stats-tile">
            <span className="stats-num">{stats.pushes.dev}</span>
            <span className="stats-cap">開発push</span>
          </div>
          <div className="stats-tile">
            <span className="stats-num">
              {stats.code.liveLines.toLocaleString()}
            </span>
            <span className="stats-cap">生きている行</span>
          </div>
        </div>

        <section className="stats-section">
          <h3>
            プロジェクト別push
            <span className="stats-hint">タップで個別の履歴へ</span>
          </h3>
          {rows.map((r) => (
            <button
              key={r.id}
              className="stats-row clickable"
              onClick={() => setDetailId(r.id)}
            >
              <span className="stats-row-title">
                {alive.get(r.id) || r.title}
              </span>
              <span className="stats-bar">
                <span
                  className="stats-bar-fill"
                  style={{ width: `${(r.pushes / max) * 100}%` }}
                />
              </span>
              <span className="stats-row-num">{r.pushes}</span>
              <span className="stats-row-caret">
                <IconChevronDown size={13} />
              </span>
            </button>
          ))}
        </section>

        <section className="stats-section">
          <h3>
            生存コード率
            <span className="stats-hint">
              書いて{stats.code.matureDays}日生き残った行の割合。品質の鏡（目標にしない）
            </span>
          </h3>
          {mature?.rate != null ? (
            <p className="stats-rate">
              <strong>{Math.round(mature.rate * 100)}%</strong>
              <span>
                {mature.added.toLocaleString()}行書いて{' '}
                {mature.surviving.toLocaleString()}行が今も生きている
              </span>
            </p>
          ) : (
            <p className="stats-rate">
              まだ熟成中（書いて{stats.code.matureDays}日経ったコミットから採点）
            </p>
          )}
          <div className="stats-commits">
            {recent.map((c) => (
              <div key={c.sha} className="stats-commit">
                <span className="stats-commit-date">{c.date.slice(5)}</span>
                <span className="stats-commit-subj">{c.subject}</span>
                <span
                  className={`stats-commit-rate${c.mature ? '' : ' young'}`}
                >
                  {c.mature
                    ? `${Math.round((c.surviving / c.added) * 100)}%`
                    : '熟成中'}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
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
          <IconArrowLeft size={18} />
        </button>
        <h2 className="trash-title">
          <IconTrash size={18} /> ゴミ箱
        </h2>
        <button className="icon-btn" onClick={onClose}>
          <IconClose size={16} /> 閉じる
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
                      <span className="trash-name">
                        <IconFolder size={15} /> {p.title || '(無題)'}
                      </span>
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
                        <IconRestore size={16} /> 復元
                      </button>
                      <button
                        className="icon-btn danger"
                        onClick={() => onPurgeProject(p.id)}
                      >
                        <IconTrash size={16} /> 完全削除
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
                      <span className="trash-name">
                        <IconFile size={15} /> {file.name || '(無題)'}
                      </span>
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
                        <IconRestore size={16} /> 復元
                      </button>
                      <button
                        className="icon-btn danger"
                        onClick={() => onPurgeFile(project.id, file.id)}
                      >
                        <IconTrash size={16} /> 完全削除
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

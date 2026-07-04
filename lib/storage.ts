import { MdFile, Project } from './types';

// ============================================================
//  データ層（今は localStorage 実装）
//  ★改良ポイント：将来 Vercel + DB にするときは、この4関数の
//    "中身だけ" を API 呼び出しに差し替えればよい。呼び出し側
//    (app/page.tsx) はこのインターフェースにだけ依存している。
// ============================================================

const KEY = 'kiroku.projects.v1'; // ★キーは変えない（既存データを失わないため）

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function now(): number {
  return Date.now();
}

// 旧形式（1プロジェクト = body 1枚）を、新形式（files 配列）へ自動変換。
// これにより、既にスマホ等に保存済みの記録もそのまま引き継がれる。
export function migrate(raw: any): Project | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = typeof raw.updatedAt === 'number' ? raw.updatedAt : now();
  const created = typeof raw.createdAt === 'number' ? raw.createdAt : t;

  // 既に新形式
  if (Array.isArray(raw.files)) {
    return {
      id: String(raw.id ?? newId()),
      title: String(raw.title ?? '(無題)'),
      status: raw.status ?? '進行中',
      files: raw.files as MdFile[],
      createdAt: created,
      updatedAt: t,
      ...(typeof raw.deletedAt === 'number' ? { deletedAt: raw.deletedAt } : {}),
      ...(raw.focused ? { focused: true } : {}),
      ...(typeof raw.nextAction === 'string'
        ? { nextAction: raw.nextAction }
        : {}),
      ...(typeof raw.goal === 'string' ? { goal: raw.goal } : {}),
      ...(typeof raw.origin === 'string' ? { origin: raw.origin } : {}),
    };
  }

  // 旧形式：body 1枚 → ファイル1つに包む
  const file: MdFile = {
    id: newId(),
    name: String(raw.title ?? 'メモ'),
    body: String(raw.body ?? ''),
    createdAt: created,
    updatedAt: t,
  };
  return {
    id: String(raw.id ?? newId()),
    title: String(raw.title ?? '(無題)'),
    status: raw.status ?? '進行中',
    files: [file],
    createdAt: created,
    updatedAt: t,
  };
}

export function loadProjects(): Project[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    return data.map(migrate).filter((p): p is Project => p !== null);
  } catch {
    return null;
  }
}

export function saveProjects(projects: Project[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(projects));
}

// ============================================================
//  リモート同期（GitHubをDB代わりに使う /api/sync 経由）
//  未設定（サーバー側に GITHUB_TOKEN 等が無い）環境では
//  /api/sync が 501 を返すので、その場合は黙って諦める
//  （= 今まで通り localStorage だけで動く）。
// ============================================================

export async function pullRemote(): Promise<Project[] | null> {
  try {
    const res = await fetch('/api/sync', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data.projects)) return null;
    return data.projects.map(migrate).filter((p: Project | null): p is Project => p !== null);
  } catch {
    return null;
  }
}

// 成功なら null、失敗なら理由の文字列を返す（画面にそのまま表示できる形）
export async function pushRemote(projects: Project[]): Promise<string | null> {
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projects }),
    });
    if (res.ok) return null;
    if (res.status === 501) return '同期は未設定（ローカルのみ保存）';
    const data = await res.json().catch(() => null);
    return data?.error ?? `同期失敗（HTTP ${res.status}）`;
  } catch {
    return '同期失敗（ネットワークエラー）';
  }
}

// ============================================================
//  マージ：ローカルとリモートを「消さない方向」で統合する。
//  - 同じidのプロジェクト → updatedAt が新しい方を採用
//  - 片方にしか無いプロジェクト → 必ず残す（＝端末のデータが消えない）
//  - 例外：初期データ(seed)は端末ごとに別idで作られるため、
//    「同名かつ一度も編集されていない」重複だけは新しい方1つに間引く
// ============================================================

function isPristineSeed(p: Project): boolean {
  // seedは createdAt === updatedAt で生まれ、編集すると updatedAt が進む
  return p.updatedAt - p.createdAt <= 1;
}

export function mergeProjects(
  local: Project[] | null,
  remote: Project[] | null
): Project[] {
  const a = local ?? [];
  const b = remote ?? [];
  if (!a.length) return b;
  if (!b.length) return a;

  const byId = new Map<string, Project>();
  for (const p of [...b, ...a]) {
    const prev = byId.get(p.id);
    if (!prev || p.updatedAt >= prev.updatedAt) byId.set(p.id, p);
  }

  // 未編集seedの同名重複を間引く（編集済みのものは絶対に消さない）
  const merged = Array.from(byId.values());
  const keep = merged.filter((p) => {
    if (!isPristineSeed(p)) return true;
    const twin = merged.find((q) => q.id !== p.id && q.title === p.title);
    if (!twin) return true;
    // 相方が編集済みならこちら(未編集)を落とす。両方未編集なら新しい方だけ残す
    if (!isPristineSeed(twin)) return false;
    return p.updatedAt > twin.updatedAt || (p.updatedAt === twin.updatedAt && p.id > twin.id);
  });

  return keep.sort((x, y) => y.updatedAt - x.updatedAt);
}

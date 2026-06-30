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
function migrate(raw: any): Project | null {
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

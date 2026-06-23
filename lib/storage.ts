import { Project } from './types';

// ============================================================
//  データ層（今は localStorage 実装）
//  ★改良ポイント：将来 Vercel + DB にするときは、この4関数の
//    "中身だけ" を API 呼び出しに差し替えればよい。呼び出し側
//    (app/page.tsx) はこのインターフェースにだけ依存している。
// ============================================================

const KEY = 'kiroku.projects.v1';

export function loadProjects(): Project[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as Project[]) : null;
  } catch {
    return null;
  }
}

export function saveProjects(projects: Project[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(projects));
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function now(): number {
  return Date.now();
}

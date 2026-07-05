// ============================================================
//  開発の軌跡（stats）の型とクライアント側の取得。
//  実データは GitHub Action が scripts/stats.mjs で計算して
//  data/stats.json に置く。アプリは /api/stats 経由で読むだけ。
//
//  数字の読み方（設計意図）:
//  - pushes / projects[].pushes: 溜まる一方の「運動量」。XPと同じで
//    減らない数字だから安心して眺められる。品質ではない。
//  - code.mature.rate: 書いてから7日生き残ったコード行の割合＝「品質の鏡」。
//    目標にせず、月イチで眺める用（グッドハートの法則対策）。
// ============================================================

export interface StatsCommit {
  sha: string;
  date: string; // YYYY-MM-DD
  subject: string;
  added: number; // このコミットが追加したコード行数
  surviving: number; // うち、今も生き残っている行数
  mature: boolean; // 7日以上経過（＝生存率の採点対象）か
}

export interface Stats {
  generatedAt: string;
  head: string;
  pushes: {
    total: number; // 全push（stats自動コミットは除く）
    dev: number; // コード開発push
    record: number; // 記録の同期push（sync:）
  };
  projects: {
    id: string;
    title: string;
    pushes: number;
    pushLog?: number[]; // pushしたコミット時刻(ms・昇順)。個別詳細の表示に使う
  }[];
  code: {
    liveLines: number; // 現在生きているコード行数
    matureDays: number;
    all: { added: number; surviving: number; rate: number | null };
    mature: { added: number; surviving: number; rate: number | null } | null;
    commits: StatsCommit[]; // 開発コミット別の内訳（新しい順）
  };
}

// 取れなければnull（statsは飾りなので、失敗してもアプリは普通に動く）
export async function fetchStats(): Promise<Stats | null> {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return null;
    const json = await res.json();
    return (json.stats as Stats) ?? null;
  } catch {
    return null;
  }
}

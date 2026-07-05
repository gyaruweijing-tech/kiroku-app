// アプリ全体で使うデータの形。ここが「契約（invariants）」。
// 将来データ層を localStorage から API/DB に替えても、この型は変えない方針。

export type Status = '進行中' | '保留' | '完了';

export const STATUSES: Status[] = ['進行中', '保留', '完了'];

// 1つの Markdown ファイル。プロジェクト（フォルダ）の中に何個でも入る。
export interface MdFile {
  id: string;
  name: string; // ファイル名（拡張子 .md は付けない）
  body: string; // Markdown 本文
  createdAt: number;
  updatedAt: number;
  deletedAt?: number; // ゴミ箱に入れた時刻。未設定＝通常表示
}

// あゆみ1件＝スタンプ。「やったこと」を1行で積み上げる（進んでる感の土台）。
// by が 'claude' のものは Claude Code が書き込んだ記録（＝AIと人の共同ログ）。
export interface LogEntry {
  id: string;
  at: number; // 押した時刻
  note: string; // やったこと1行
  by?: 'claude'; // 省略＝本人
  xp?: number; // このスタンプで得た経験値（押した瞬間にランダム決定・以後不変）。省略＝旧スタンプ
}

// プロジェクト＝フォルダ。中に MdFile を複数持てる。
export interface Project {
  id: string;
  title: string;
  status: Status;
  files: MdFile[];
  createdAt: number;
  updatedAt: number;
  deletedAt?: number; // ゴミ箱に入れた時刻。未設定＝通常表示
  focused?: boolean; // いま注力（迷ったらこれ）。常に1つだけ true になる想定
  nextAction?: string; // 次の一手（次にやること1行）
  goal?: string; // 狙い＝目指す先・未来のゴール（モチベの方向）
  origin?: string; // 原点＝なぜ始めたか・過去のきっかけ（折れた時に効く物語）
  log?: LogEntry[]; // あゆみ＝やったことスタンプの積み上げ
}

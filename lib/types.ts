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
  goal?: string; // 北極星＝このプロジェクトの一言ゴール（モチベの方向）
  origin?: string; // 原点＝なぜ始めたか（折れた時に効く物語）
}

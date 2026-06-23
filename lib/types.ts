// アプリ全体で使うデータの形。ここが「契約（invariants）」。
// 将来データ層を localStorage から API/DB に替えても、この型は変えない方針。

export type Status = '進行中' | '保留' | '完了';

export const STATUSES: Status[] = ['進行中', '保留', '完了'];

export interface Project {
  id: string;
  title: string;
  status: Status;
  body: string; // Markdown 本文（= あなたの「MDファイル」の中身）
  createdAt: number;
  updatedAt: number;
}

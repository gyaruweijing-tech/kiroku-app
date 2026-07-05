import { LogEntry } from './types';

// ============================================================
//  XP（経験値）まわりの純関数。モチベーション設計の心臓部。
//
//  設計方針（2026-07-05 本人と決めた）:
//  - スタンプ1個ごとにランダムXPを「大きく」出す
//    （意味のない数字でも表示されるだけでモチベが上がる、を採用）
//  - その日そのプロジェクトへの最初のスタンプ＝「今日の初着手」で2倍
//    （着手そのものを心拍にする）
//  - 週ベース：週3日以上着手した週が連続すると倍率が育つ
//    （毎日は要求しない。1日サボっても全崩壊しない ← 本人の希望）
//  - Lvアップの瞬間に狙い(北極星)と原点を再表示する（page.tsx側の演出）
//    （ドーパミンに釣られて元のモチベを忘れる問題への対策）
// ============================================================

export const LEGACY_XP = 50; // xp無しの旧スタンプ（Claude書き込み含む）は50として数える
export const WEEK_GOAL_DAYS = 3; // 週に何日着手できたら「達成した週」か

// 「その日やったか」で数えるための日付キー（端末のローカル時間基準）
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// その週の月曜0時のタイムスタンプ（週の識別子）
function weekStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // 月曜=0
  return d.getTime();
}

// 今週（月曜はじまり）に着手した日数
export function daysThisWeek(log: LogEntry[] | undefined): number {
  if (!log?.length) return 0;
  const ws = weekStart(Date.now());
  const days = new Set<string>();
  for (const e of log) if (e.at >= ws) days.add(dayKey(e.at));
  return days.size;
}

// 週ストリーク：週3日以上を満たした週の連続数。
// 今週はまだ途中なので「達成済みなら+1、未達でも切らない」で先週から遡る
export function calcWeekStreak(log: LogEntry[] | undefined): number {
  if (!log?.length) return 0;
  const byWeek = new Map<number, Set<string>>();
  for (const e of log) {
    const w = weekStart(e.at);
    if (!byWeek.has(w)) byWeek.set(w, new Set());
    byWeek.get(w)!.add(dayKey(e.at));
  }
  const MS_WEEK = 7 * 86400000;
  let n = 0;
  let w = weekStart(Date.now());
  if ((byWeek.get(w)?.size ?? 0) >= WEEK_GOAL_DAYS) n++;
  for (w -= MS_WEEK; (byWeek.get(w)?.size ?? 0) >= WEEK_GOAL_DAYS; w -= MS_WEEK) n++;
  return n;
}

// 週ストリークによる倍率：1週続くごとに+25%、上限×2.5
export function weekMultiplier(weekStreak: number): number {
  return Math.min(1 + 0.25 * weekStreak, 2.5);
}

// ガチャ：60%通常 / 30%レア / 10%大当たり
export type XpTier = 'normal' | 'rare' | 'jackpot';
export interface XpRoll {
  xp: number; // 最終獲得XP（倍率込み）
  tier: XpTier;
  mult: number; // 週ストリーク倍率
  firstToday: boolean; // 今日の初着手（×2）だったか
}

export function rollXp(log: LogEntry[] | undefined): XpRoll {
  const r = Math.random();
  let tier: XpTier;
  let base: number;
  if (r < 0.6) {
    tier = 'normal';
    base = 40 + Math.floor(Math.random() * 60); // 40〜99
  } else if (r < 0.9) {
    tier = 'rare';
    base = 100 + Math.floor(Math.random() * 100); // 100〜199
  } else {
    tier = 'jackpot';
    base = 222 + Math.floor(Math.random() * 222); // 222〜443
  }
  const firstToday = !(log ?? []).some((e) => dayKey(e.at) === dayKey(Date.now()));
  if (firstToday) base *= 2;
  const mult = weekMultiplier(calcWeekStreak(log));
  return { xp: Math.round(base * mult), tier, mult, firstToday };
}

// プロジェクトの総XP（旧スタンプは LEGACY_XP 扱い）
export function totalXp(log: LogEntry[] | undefined): number {
  return (log ?? []).reduce((sum, e) => sum + (e.xp ?? LEGACY_XP), 0);
}

// 総XP → レベルと進捗。Lv2は300XP（2〜3スタンプ）で早めに出す。
// 以降は必要量が15%ずつ増える（序盤はドーパミン、後半は積み上げ感）
export function levelInfo(total: number): {
  level: number;
  cur: number; // 現レベル内で貯めたXP
  need: number; // 次のレベルまでに必要なXP
} {
  let level = 1;
  let need = 300;
  let rem = total;
  while (rem >= need) {
    rem -= need;
    level++;
    need = Math.round(need * 1.15);
  }
  return { level, cur: rem, need };
}
